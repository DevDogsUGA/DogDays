-- Row Level Security for the dogdays schema: every policy has an allow and a
-- deny asserted, and so does the claim function.
--
-- Run with `supabase test db` against a local stack. Each file runs in a
-- transaction that is rolled back, so nothing here persists.
begin;

create extension if not exists pgtap with schema extensions;

select plan(44);

-- How many rows a statement touched, run as whoever is calling. (pgTAP cannot
-- wrap a data-modifying statement, and a policy that hides a row makes an
-- update or delete succeed with zero rows rather than fail.)
create function public.rows_touched(sql text) returns bigint
  language plpgsql
  as $$ declare n bigint; begin execute sql; get diagnostics n = row_count; return n; end $$;
grant execute on function public.rows_touched(text) to public;

-- Fixed ids keep the failures readable.
--   alice, bob   members with a DevDogs identity whose platform id is the legacy id below
--   carol        a member with no DevDogs identity at all
--   dave         a member whose google identity happens to carry alice's legacy id
\set alice '''00000000-0000-4000-8000-0000000000a1'''
\set bob   '''00000000-0000-4000-8000-0000000000b2'''
\set carol '''00000000-0000-4000-8000-0000000000c3'''
\set dave  '''00000000-0000-4000-8000-0000000000d4'''
\set alice_legacy '''11111111-1111-4111-8111-111111111111'''
\set bob_legacy   '''22222222-2222-4222-8222-222222222222'''

insert into auth.users (id, email, aud, role) values
  (:alice, 'alice@dogdays.devdogsuga.test', 'authenticated', 'authenticated'),
  (:bob,   'bob@dogdays.devdogsuga.test',   'authenticated', 'authenticated'),
  (:carol, 'carol@dogdays.devdogsuga.test', 'authenticated', 'authenticated'),
  (:dave,  'dave@dogdays.devdogsuga.test',  'authenticated', 'authenticated');

insert into auth.identities (provider_id, user_id, identity_data, provider) values
  (:alice_legacy, :alice, '{}'::jsonb, 'custom:devdogsuga'),
  (:bob_legacy,   :bob,   '{}'::jsonb, 'custom:devdogsuga'),
  (:alice_legacy, :dave,  '{}'::jsonb, 'google'),
  ('not-a-uuid',  :carol, '{}'::jsonb, 'custom:devdogsuga');

-- Rows copied from the old DogDays, nobody's yet (as the copy job writes them).
insert into dogdays."userSavedPlans" ("legacyUserId", "academicPeriod", title, crns) values
  (:alice_legacy, 202608, 'Alice fall', '{10001,10002}'),
  (:alice_legacy, 202702, 'Alice spring', '{20001}'),
  (:bob_legacy,   202608, 'Bob fall', '{30001}');
insert into dogdays."userPreferences" ("legacyUserId", "currentAcademicPeriod") values
  (:alice_legacy, 202608), (:bob_legacy, 202702);
insert into dogdays."userPlanDrafts" ("legacyUserId", "academicPeriod", "minCreditHours") values
  (:alice_legacy, 202608, 9), (:alice_legacy, 202702, 10), (:bob_legacy, 202608, 11);
insert into dogdays."userPlanDraftCourses" ("legacyUserId", "academicPeriod", "courseId") values
  (:alice_legacy, 202608, 1), (:alice_legacy, 202608, 2), (:alice_legacy, 202702, 3), (:bob_legacy, 202608, 4);

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'dogdays' and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint, 'every table in dogdays has row level security on');

-- Unclaimed rows belong to nobody.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);

select is((select count(*) from dogdays."userSavedPlans"), 0::bigint, 'alice cannot see copied plans nobody has claimed');
select is((select count(*) from dogdays."userPreferences"), 0::bigint, 'alice cannot see unclaimed preferences');

-- Own rows: allowed.
select lives_ok($$insert into dogdays."userSavedPlans" ("userId", "academicPeriod", title, crns)
  values ('00000000-0000-4000-8000-0000000000a1', 202608, 'mine', '{1,2}')$$, 'alice can insert her own plan');
select lives_ok($$insert into dogdays."userPreferences" ("userId", "currentAcademicPeriod")
  values ('00000000-0000-4000-8000-0000000000a1', 202608)$$, 'alice can insert her preferences');
select lives_ok($$insert into dogdays."userPlanDrafts" ("userId", "academicPeriod")
  values ('00000000-0000-4000-8000-0000000000a1', 202608)$$, 'alice can insert a draft');
select lives_ok($$insert into dogdays."userPlanDraftCourses" ("userId", "academicPeriod", "courseId")
  values ('00000000-0000-4000-8000-0000000000a1', 202608, 77), ('00000000-0000-4000-8000-0000000000a1', 202608, 1)$$,
  'alice can insert draft courses');
select is((select count(*) from dogdays."userSavedPlans"), 1::bigint, 'alice sees her own plan');
select lives_ok($$update dogdays."userSavedPlans" set title = 'renamed' where title = 'mine'$$, 'alice can update her plan');
select is((select title from dogdays."userSavedPlans"), 'renamed', 'the update took effect');
select lives_ok($$insert into dogdays."userSavedPlans" (id, "userId", "academicPeriod", title, crns)
  values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 202608, 'merged', '{3}')$$, 'alice can keep a local plan id when she signs in');
select lives_ok($$update dogdays."userSavedPlans" set "courseIds" = '{5,6}' where title = 'renamed'$$, 'alice can record the courses a plan came from');
select is((select "courseIds" from dogdays."userSavedPlans" where title = 'renamed'), '{5,6}'::integer[], 'the course ids were stored');

-- Sharing: a plan is private until it has a shareId, and no two plans share one.
select is((select count(*) from dogdays."userSavedPlans" where "shareId" is null),
  2::bigint, 'two plans can both be unshared');
select lives_ok($$update dogdays."userSavedPlans" set "shareId" = '33333333-3333-4333-8333-333333333333' where title = 'renamed'$$,
  'alice can share her plan');
select is((select "shareId" from dogdays."userSavedPlans" where title = 'renamed'),
  '33333333-3333-4333-8333-333333333333'::uuid, 'the share id was stored');
select throws_ok($$update dogdays."userSavedPlans" set "shareId" = '33333333-3333-4333-8333-333333333333' where title = 'merged'$$,
  '23505', null, 'two plans cannot use the same share id');
select lives_ok($$update dogdays."userSavedPlans" set "shareId" = null where title = 'renamed'$$,
  'alice can stop sharing her plan');
select is((select count(*) from dogdays."userSavedPlans" where title = 'renamed' and "shareId" is null),
  1::bigint, 'the plan is private again');
select lives_ok($$update dogdays."userSavedPlans" set "shareId" = '33333333-3333-4333-8333-333333333333' where title = 'renamed'$$,
  'alice can share her plan again');

-- Never legacyUserId: only the copy job writes it.
select throws_ok($$insert into dogdays."userSavedPlans" ("userId", "legacyUserId", "academicPeriod", title, crns)
  values ('00000000-0000-4000-8000-0000000000a1', '22222222-2222-4222-8222-222222222222', 202608, 'squat', '{}')$$,
  '42501', null, 'alice cannot set legacyUserId on insert');
select throws_ok($$update dogdays."userSavedPlans" set "legacyUserId" = '22222222-2222-4222-8222-222222222222'$$,
  '42501', null, 'alice cannot set legacyUserId on update');

-- Not someone else's.
select throws_ok($$insert into dogdays."userSavedPlans" ("userId", "academicPeriod", title, crns)
  values ('00000000-0000-4000-8000-0000000000b2', 202608, 'forged', '{}')$$,
  '42501', null, 'alice cannot insert a plan as bob');
select throws_ok($$update dogdays."userSavedPlans" set "userId" = '00000000-0000-4000-8000-0000000000b2'$$,
  '42501', null, 'alice cannot hand her plan to bob');

-- Bob.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000b2', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true);

select is((select count(*) from dogdays."userSavedPlans"), 0::bigint, 'bob cannot see alice''s plan');
select is(public.rows_touched($$update dogdays."userSavedPlans" set title = 'hijack'$$),
  0::bigint, 'bob cannot update alice''s plan');
select is(public.rows_touched($$delete from dogdays."userSavedPlans"$$),
  0::bigint, 'bob cannot delete alice''s plan');
select is((select count(*) from dogdays."userSavedPlans" where "shareId" = '33333333-3333-4333-8333-333333333333'),
  0::bigint, 'bob cannot read alice''s plan by its share id');
select is(public.rows_touched($$update dogdays."userSavedPlans" set "shareId" = null where "shareId" = '33333333-3333-4333-8333-333333333333'$$),
  0::bigint, 'bob cannot unshare alice''s plan');
select throws_ok($$insert into dogdays."userSavedPlans" ("userId", "academicPeriod", title, crns, "shareId")
  values ('00000000-0000-4000-8000-0000000000b2', 202608, 'copycat', '{}', '33333333-3333-4333-8333-333333333333')$$,
  '23505', null, 'bob cannot reuse alice''s share id');
select is((select count(*) from dogdays."userPlanDraftCourses"), 0::bigint, 'bob cannot see alice''s draft courses');

-- The claim function.

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000c3', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true);
select is((dogdays.claim_legacy_data()->>'claimed')::boolean, false,
  'a member whose DevDogs id is not a uuid claims nothing');

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000d4', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000d4', true);
select is((dogdays.claim_legacy_data()->>'claimed')::boolean, false,
  'a google identity that carries a legacy id claims nothing (only custom:devdogsuga counts)');

-- Bob claims his own; alice's stay where they are.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000b2', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true);
select is(dogdays.claim_legacy_data(),
  '{"claimed": true, "savedPlans": 1, "preferences": 1, "drafts": 1, "draftCourses": 1}'::jsonb,
  'bob claims exactly his own copied rows');
select is((select count(*) from dogdays."userSavedPlans" where title = 'Bob fall'), 1::bigint, 'bob now sees his copied plan');
select is(dogdays.claim_legacy_data(),
  '{"claimed": true, "savedPlans": 0, "preferences": 0, "drafts": 0, "draftCourses": 0}'::jsonb,
  'claiming again moves nothing');

-- Alice already has a 202608 draft, draft course and preferences of her own, so
-- the copies of those stay unclaimed; the rest move.
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select is(dogdays.claim_legacy_data(),
  '{"claimed": true, "savedPlans": 2, "preferences": 0, "drafts": 1, "draftCourses": 2}'::jsonb,
  'alice keeps what she already made and claims the rest');
select is((select count(*) from dogdays."userSavedPlans"), 4::bigint, 'alice has her two own plans plus the two copied ones');

-- Callers without a session.
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select dogdays.claim_legacy_data()$$, '28000', null, 'a request with no user cannot claim');

reset role;
set local role anon;
select throws_ok($$select 1 from dogdays."userSavedPlans"$$, '42501', null, 'anon cannot read the schema');
select throws_ok($$select dogdays.claim_legacy_data()$$, '42501', null, 'anon cannot call the claim function');

reset role;
set local role authenticated;
select throws_ok($$select 1 from dogdays."legacyImports"$$, '42501', null, 'members cannot read the import ledger');

reset role;
set local role service_role;
select lives_ok($$insert into dogdays."legacyImports" (name) values ('platform')$$, 'the deploy (service_role) can record an import');
select is((select count(*) from dogdays."legacyImports"), 1::bigint, 'and read it back');

select * from finish();
rollback;
