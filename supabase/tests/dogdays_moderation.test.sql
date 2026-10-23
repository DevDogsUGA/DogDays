-- The moderation receiver: dogdays.apply_moderation_event (idempotent,
-- order-safe, atomic), bans, user.delete, who may call it, and what account
-- deletion does with the moderation tables and the copied rows.
--
-- Run with `supabase test db` against a local stack. Rolled back, so nothing
-- here persists.
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

\set alice '''00000000-0000-4000-8000-0000000000a1'''
\set bob   '''00000000-0000-4000-8000-0000000000b2'''
\set alice_platform '''aaaaaaaa-0000-4000-8000-000000000001'''
\set bob_platform   '''aaaaaaaa-0000-4000-8000-000000000002'''
\set ghost_platform '''aaaaaaaa-0000-4000-8000-000000000009'''

insert into auth.users (id, email, aud, role) values
  (:alice, 'alice@dogdays.devdogsuga.test', 'authenticated', 'authenticated'),
  (:bob,   'bob@dogdays.devdogsuga.test',   'authenticated', 'authenticated');
insert into auth.identities (provider_id, user_id, identity_data, provider) values
  (:alice_platform, :alice, '{}'::jsonb, 'custom:devdogsuga'),
  (:bob_platform,   :bob,   '{}'::jsonb, 'custom:devdogsuga');
insert into dogdays."userSavedPlans" ("userId", "academicPeriod", title, crns) values
  (:alice, 202608, 'Alice fall', '{10001}');
-- A copy of alice's old plans nobody claimed (keyed by her platform id only).
insert into dogdays."userSavedPlans" ("legacyUserId", "academicPeriod", title, crns) values
  (:alice_platform, 202702, 'Alice old spring', '{20001}');
insert into dogdays."userPreferences" ("legacyUserId", "currentAcademicPeriod") values
  (:alice_platform, 202608), (:bob_platform, 202608);

-- Who may call it: the service role only.
set local role authenticated;
select throws_ok($$select dogdays.apply_moderation_event('msg_x', '{}'::jsonb)$$, '42501', null, 'a member cannot call apply_moderation_event');
select throws_ok($$select 1 from moderation.events$$, '42501', null, 'a member cannot read the moderation events');
reset role;
set local role anon;
select throws_ok($$select dogdays.apply_moderation_event('msg_x', '{}'::jsonb)$$, '42501', null, 'anon cannot call apply_moderation_event');
select throws_ok($$select 1 from moderation.user_states$$, '42501', null, 'anon cannot read the user states');
reset role;
set local role service_role;
select lives_ok($$select 1 from moderation.decisions$$, 'the service role can read the decisions');
reset role;

-- Bad input raises, so the route answers 5xx and the platform retries.
select throws_ok($$select dogdays.apply_moderation_event('', '{"type":"user.ban","timestamp":"2027-01-01T10:00:00Z","data":{"userId":"aaaaaaaa-0000-4000-8000-000000000001"}}'::jsonb)$$, 'P0001', 'missing message id', 'an empty id is refused');
select throws_ok($$select dogdays.apply_moderation_event('msg_bad', '{"type":"user.nuke","timestamp":"2027-01-01T10:00:00Z","data":{}}'::jsonb)$$, 'P0001', 'unknown message type user.nuke', 'an unknown type is refused');

-- A suspension locks the member out and revokes their sessions.
insert into auth.sessions (id, user_id) values ('00000000-0000-4000-8000-0000000000c1', :bob);
select is(
  dogdays.apply_moderation_event('msg_1', '{"type":"user.suspend","timestamp":"2027-01-01T10:00:00Z","data":{"userId":"aaaaaaaa-0000-4000-8000-000000000002","reason":"spam","reportId":null}}'::jsonb),
  jsonb_build_object('outcome', 'applied', 'userId', '00000000-0000-4000-8000-0000000000b2'),
  'a user.suspend is applied and names the linked member');
select ok((select banned_until > now() + interval '10 years' from auth.users where id = :bob), 'the member is banned');
select is((select count(*)::int from auth.sessions where user_id = :bob), 0, 'and their sessions are gone');
select is((select "state" from moderation.user_states where "platformUserId" = :bob_platform), 'suspended', 'the state is recorded');

-- Idempotent.
select is(
  (dogdays.apply_moderation_event('msg_1', '{"type":"user.suspend","timestamp":"2027-01-01T10:00:00Z","data":{"userId":"aaaaaaaa-0000-4000-8000-000000000002","reason":"spam","reportId":null}}'::jsonb))->>'outcome',
  'duplicate', 'a replay of the same webhook id is a duplicate');
select is((select count(*)::int from moderation.events), 1, 'and records nothing more');

-- Order-safe: a restore dated before the suspension is stale and changes nothing.
select is(
  (dogdays.apply_moderation_event('msg_2', '{"type":"user.restore","timestamp":"2027-01-01T09:59:00Z","data":{"userId":"aaaaaaaa-0000-4000-8000-000000000002","reason":null,"reportId":null}}'::jsonb))->>'outcome',
  'stale', 'a restore older than the last decision is stale');
select ok((select banned_until is not null from auth.users where id = :bob), 'the ban stands');
select is(
  (dogdays.apply_moderation_event('msg_2', '{"type":"user.restore","timestamp":"2027-01-01T09:59:00Z","data":{"userId":"aaaaaaaa-0000-4000-8000-000000000002","reason":null,"reportId":null}}'::jsonb))->>'outcome',
  'duplicate', 'a stale message that is replayed is a duplicate, not stale twice');

-- A later restore lifts it.
select is(
  (dogdays.apply_moderation_event('msg_3', '{"type":"user.restore","timestamp":"2027-01-01T11:00:00Z","data":{"userId":"aaaaaaaa-0000-4000-8000-000000000002","reason":null,"reportId":null}}'::jsonb))->>'outcome',
  'applied', 'a later restore is applied');
select ok((select banned_until is null from auth.users where id = :bob), 'the member can sign in again');

-- Content messages are recorded and change nothing else.
select is(
  dogdays.apply_moderation_event('msg_4', '{"type":"content.hide","timestamp":"2027-01-01T12:00:00Z","data":{"contentType":"plan","contentRef":"11111111-1111-4111-8111-111111111111","reportId":null}}'::jsonb),
  jsonb_build_object('outcome', 'applied', 'userId', null),
  'a content.hide is recorded');
select is((select count(*)::int from dogdays."userSavedPlans"), 2, 'and no plan is touched');

-- user.delete: lock-out, the unclaimed copies go, the reason is dropped.
select is(
  dogdays.apply_moderation_event('msg_5', '{"type":"user.delete","timestamp":"2027-01-02T10:00:00Z","data":{"userId":"aaaaaaaa-0000-4000-8000-000000000001","reason":"free text about alice","reportId":null}}'::jsonb),
  jsonb_build_object('outcome', 'applied', 'userId', '00000000-0000-4000-8000-0000000000a1'),
  'a user.delete is applied and names the linked member');
select ok((select banned_until is not null from auth.users where id = :alice), 'the member is locked out until the route deletes them');
select is((select count(*)::int from dogdays."userSavedPlans" where "legacyUserId" = :alice_platform), 0, 'the unclaimed copies keyed by the platform id are deleted');
select is((select count(*)::int from dogdays."userPreferences" where "legacyUserId" = :alice_platform), 0, 'including the copied preferences');
select is((select count(*)::int from dogdays."userPreferences" where "legacyUserId" = :bob_platform), 1, 'but nobody else''s');
select is((select "state" from moderation.user_states where "platformUserId" = :alice_platform), 'deleted', 'the deleted state is recorded');
select is((select "reason" from moderation.user_states where "platformUserId" = :alice_platform), null, 'with no reason');
select is((select "payload" #>> '{data,reason}' from moderation.events where "id" = 'msg_5'), null, 'and the stored message keeps no reason either');

-- A repeat names the user while they still exist (a failed admin call is retried)...
select is(
  dogdays.apply_moderation_event('msg_5', '{"type":"user.delete","timestamp":"2027-01-02T10:00:00Z","data":{"userId":"aaaaaaaa-0000-4000-8000-000000000001","reason":null,"reportId":null}}'::jsonb),
  jsonb_build_object('outcome', 'duplicate', 'userId', '00000000-0000-4000-8000-0000000000a1'),
  'a repeated user.delete is a duplicate that still names the member');

-- ...and the route's admin delete cascades every member table.
delete from auth.users where id = :alice;
select is((select count(*)::int from dogdays."userSavedPlans" where "userId" = :alice), 0, 'deleting the auth user cascades their plans');
select is((select count(*)::int from moderation.user_states where "platformUserId" = :alice_platform), 1, 'the moderation state outlives the member');

-- An unknown user: recorded, no member named, no error.
select is(
  dogdays.apply_moderation_event('msg_6', '{"type":"user.delete","timestamp":"2027-01-03T10:00:00Z","data":{"userId":"aaaaaaaa-0000-4000-8000-000000000009","reason":null,"reportId":null}}'::jsonb),
  jsonb_build_object('outcome', 'applied', 'userId', null),
  'a user.delete for someone with no DogDays account is applied with no member');

-- A stale user.delete still deletes what is keyed by the platform id.
insert into dogdays."userSavedPlans" ("legacyUserId", "academicPeriod", title, crns) values
  (:bob_platform, 202702, 'Bob old spring', '{30001}');
select is(
  (dogdays.apply_moderation_event('msg_7', '{"type":"user.delete","timestamp":"2027-01-01T08:00:00Z","data":{"userId":"aaaaaaaa-0000-4000-8000-000000000002","reason":null,"reportId":null}}'::jsonb))->>'outcome',
  'stale', 'a user.delete older than the last decision is stale');
select is((select count(*)::int from dogdays."userSavedPlans" where "legacyUserId" = :bob_platform), 0, 'but it still deletes what is keyed by the platform id');

select * from finish();
rollback;
