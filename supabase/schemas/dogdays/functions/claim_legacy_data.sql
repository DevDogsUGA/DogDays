-- Moves the rows copied from the old DogDays (legacyUserId = the member's
-- platform user id) onto the signed-in member. Call it once after sign-in; it
-- is safe to call every time.
--
-- Who the member was on the platform comes from their DevDogs identity:
-- auth.identities.provider_id for provider `custom:devdogsuga` is the `sub` of
-- the platform's ID token, which is the platform user's id. Nothing the member
-- can write decides it, so one member cannot claim another's rows.
--
-- A member who already has a row of their own for the same preferences, draft
-- or draft course keeps their own: the copied row stays unclaimed, nothing is
-- deleted or merged. Saved plans never conflict (each is its own row).
--
-- Returns what moved: {"claimed": bool, "savedPlans": n, "preferences": n,
-- "drafts": n, "draftCourses": n}. `claimed` is false when the member has no
-- DevDogs identity.
CREATE OR REPLACE FUNCTION dogdays.claim_legacy_data ()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  me     uuid := auth.uid();
  legacy uuid;
  plans  integer;
  prefs  integer;
  drafts integer;
  dcs    integer;
begin
  if me is null then
    raise exception 'Sign in to claim your saved data.' using errcode = '28000';
  end if;

  -- Two tabs claiming at once would otherwise race on the unique keys.
  perform pg_advisory_xact_lock(hashtextextended('dogdays.claim_legacy_data:' || me::text, 0));

  select i."provider_id"::uuid
    into legacy
    from "auth"."identities" i
   where i."user_id" = me
     and i."provider" = 'custom:devdogsuga'
     and i."provider_id" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   limit 1;

  if legacy is null then
    return jsonb_build_object(
      'claimed', false, 'savedPlans', 0, 'preferences', 0, 'drafts', 0, 'draftCourses', 0
    );
  end if;

  with moved as (
    update "dogdays"."userSavedPlans" p
       set "userId" = me
     where p."legacyUserId" = legacy and p."userId" is null
    returning 1
  ) select count(*) into plans from moved;

  with moved as (
    update "dogdays"."userPreferences" p
       set "userId" = me
     where p."legacyUserId" = legacy and p."userId" is null
       and not exists (select 1 from "dogdays"."userPreferences" mine where mine."userId" = me)
    returning 1
  ) select count(*) into prefs from moved;

  with moved as (
    update "dogdays"."userPlanDrafts" d
       set "userId" = me
     where d."legacyUserId" = legacy and d."userId" is null
       and not exists (
         select 1 from "dogdays"."userPlanDrafts" mine
          where mine."userId" = me and mine."academicPeriod" = d."academicPeriod")
    returning 1
  ) select count(*) into drafts from moved;

  with moved as (
    update "dogdays"."userPlanDraftCourses" c
       set "userId" = me
     where c."legacyUserId" = legacy and c."userId" is null
       and not exists (
         select 1 from "dogdays"."userPlanDraftCourses" mine
          where mine."userId" = me
            and mine."academicPeriod" = c."academicPeriod"
            and mine."courseId" = c."courseId")
    returning 1
  ) select count(*) into dcs from moved;

  return jsonb_build_object(
    'claimed', true, 'savedPlans', plans, 'preferences', prefs, 'drafts', drafts, 'draftCourses', dcs
  );
end;
$function$;

REVOKE ALL ON FUNCTION dogdays.claim_legacy_data () FROM PUBLIC;

GRANT EXECUTE ON FUNCTION dogdays.claim_legacy_data () TO "authenticated";
-- pin check
