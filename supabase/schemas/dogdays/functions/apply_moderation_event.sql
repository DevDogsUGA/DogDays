-- The moderation receiver, in one transaction. The receiver route
-- (src/app/(api)/platform-moderation) verifies the Standard Webhooks signature,
-- then calls this with the webhook id and the message body, as the service role.
-- It lives in `dogdays` because that is the one schema the API serves; the state
-- it writes is in `moderation`. The three rules are the reference receiver's
-- (the SDK's `applyModerationEvent`), in SQL:
--
--   1. Idempotent: an id is applied at most once. A replay answers
--      'duplicate'.
--   2. Order-safe: a message dated before the last decision on the same item
--      answers 'stale' and changes nothing.
--   3. Atomic: the id, the decision and the change commit together. If the
--      change fails, the id is not recorded, so the platform's retry is applied
--      rather than ignored as a duplicate.
--
-- What a message does here (DogDays holds no user-written content, so the
-- content messages are recorded and nothing else):
--   content.hide / .remove / .restore   recorded only
--   user.suspend / user.ban             the member cannot sign in and the
--                                       sessions they hold are revoked
--   user.restore                        lifts it
--   user.delete                         the DevDogs account is gone. The state
--                                       is recorded as 'deleted' with the reason
--                                       dropped, the member is locked out, and
--                                       the copied rows keyed by the platform id
--                                       (legacyUserId) are deleted. The auth user
--                                       itself is deleted by the route through the
--                                       admin API right after this commits, and
--                                       every member table cascades from it.
--
-- Returns {"outcome": 'applied' | 'duplicate' | 'stale', "userId": <the DogDays
-- auth user linked to that DevDogs identity, or null>}. `userId` is set for the
-- user.* messages only. It is returned for a duplicate too, so a retry after a
-- failed admin API call still finds the user to delete.
CREATE OR REPLACE FUNCTION dogdays.apply_moderation_event (p_id text, p_message jsonb)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_type text := p_message ->> 'type';
  v_data jsonb := p_message -> 'data';
  v_decided timestamptz := (p_message ->> 'timestamp')::timestamptz;
  v_is_content boolean := v_type like 'content.%';
  v_key text;
  v_last timestamptz;
  v_inserted integer;
  v_platform_user uuid;
  v_user uuid;
  v_ban_until constant timestamptz := now() + interval '100 years';
begin
  if p_id is null or p_id = '' then
    raise exception 'missing message id';
  end if;
  if v_type not in ('content.hide', 'content.remove', 'content.restore',
                    'user.suspend', 'user.ban', 'user.restore', 'user.delete') then
    raise exception 'unknown message type %', v_type;
  end if;
  if v_decided is null then
    raise exception 'missing timestamp';
  end if;

  if v_is_content then
    v_key := 'content:' || (v_data ->> 'contentType') || ':' || (v_data ->> 'contentRef');
  else
    v_platform_user := (v_data ->> 'userId')::uuid;
    v_key := 'user:' || v_platform_user::text;
    select i.user_id into v_user
      from auth.identities i
     where i.provider = 'custom:devdogsuga' and i.provider_id = v_platform_user::text;
  end if;

  -- 1. Idempotent. The id is recorded before the ordering check, so a stale
  -- message that is replayed is a duplicate, not stale twice.
  insert into moderation.events ("id", "type", "itemKey", "decidedAt", "payload")
  values (p_id, v_type, v_key, v_decided,
          -- A deleted account keeps no free text about the person.
          case when v_type = 'user.delete' then jsonb_set(p_message, '{data,reason}', 'null'::jsonb) else p_message end)
  on conflict ("id") do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('outcome', 'duplicate', 'userId', v_user);
  end if;

  -- Deletion is final, so what is keyed by the platform id goes whatever the
  -- ordering says (a stale user.delete still deletes).
  if v_type = 'user.delete' then
    delete from dogdays."userSavedPlans" where "legacyUserId" = v_platform_user;
    delete from dogdays."userPlanDraftCourses" where "legacyUserId" = v_platform_user;
    delete from dogdays."userPlanDrafts" where "legacyUserId" = v_platform_user;
    delete from dogdays."userPreferences" where "legacyUserId" = v_platform_user;
  end if;

  -- 2. Order-safe. The advisory lock makes two messages for one item apply one
  -- after the other, even when neither has a decision row to lock yet.
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select d."decidedAt" into v_last from moderation.decisions d where d."itemKey" = v_key for update;
  if found and v_decided < v_last then
    -- Deletion is final: even a stale user.delete leaves the 'deleted'
    -- tombstone, so a replay can't apply an older decision to a new account.
    if v_type = 'user.delete' then
      insert into moderation.user_states ("platformUserId", "state", "reason", "decidedAt")
      values (v_platform_user, 'deleted', null, v_decided)
      on conflict ("platformUserId") do update
        set "state" = 'deleted', "reason" = null;
    end if;
    update moderation.events e set "outcome" = 'stale' where e."id" = p_id;
    return jsonb_build_object('outcome', 'stale', 'userId', v_user);
  end if;

  insert into moderation.decisions ("itemKey", "type", "decidedAt")
  values (v_key, v_type, v_decided)
  on conflict ("itemKey") do update set "type" = excluded."type", "decidedAt" = excluded."decidedAt";

  -- 3. Apply.
  if not v_is_content then
    insert into moderation.user_states ("platformUserId", "state", "reason", "decidedAt")
    values (
      v_platform_user,
      case v_type when 'user.suspend' then 'suspended' when 'user.ban' then 'banned'
                  when 'user.delete' then 'deleted' else 'active' end,
      case when v_type = 'user.delete' then null else v_data ->> 'reason' end,
      v_decided
    )
    on conflict ("platformUserId") do update
      set "state" = excluded."state", "reason" = excluded."reason", "decidedAt" = excluded."decidedAt";

    if v_user is not null then
      if v_type = 'user.restore' then
        update auth.users u set banned_until = null where u.id = v_user;
      else
        -- Sign-in is refused from now on, and the sessions they hold die with
        -- the ban rather than at their next refresh.
        update auth.users u set banned_until = v_ban_until where u.id = v_user;
        delete from auth.sessions s where s.user_id = v_user;
      end if;
    end if;
  end if;

  return jsonb_build_object('outcome', 'applied', 'userId', v_user);
end;
$function$;

REVOKE ALL ON FUNCTION dogdays.apply_moderation_event (text, jsonb) FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION dogdays.apply_moderation_event (text, jsonb) TO "service_role";
