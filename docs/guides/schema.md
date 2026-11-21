---
name: DogDays database
description: The tables DogDays owns, how they are protected, and how to change them.
order: 20
section: guides
---

# DogDays database

DogDays has its own Supabase project. It holds **only members' data**: the
catalog lives behind the [catalog API](./catalog.md), so there are no course
tables and no foreign keys into one. Everything is in the `dogdays` schema and
protected by Row Level Security: a signed-in member reads and writes only the
rows whose `userId` is theirs, and a signed-out visitor never reaches the
database (their drafts and plans stay in the browser).

| Table | Holds |
| --- | --- |
| `userPreferences` | the member's current term |
| `userPlanDrafts` | the unsaved plan for one term: time window, campus, credit limits |
| `userPlanDraftCourses` | the courses in a draft, by catalog `courseId`, and the CRNs excluded |
| `userSavedPlans` | a saved schedule: its CRNs, the `courseIds` it came from, a title, pinned |
| `legacyImports` | which old-app copies have run (service role only) |
| `moderation.events`, `.decisions`, `.user_states` | what the [moderation receiver](./moderation.md) has applied (service role only, not served by the API) |

`legacyUserId` columns and `claim_legacy_data()` are how a member's plans from
the old app (the shared DevDogs database) reach their account: the one-time copy
fills `legacyUserId`, and the function moves those rows to the member the first
time they sign in. Members cannot write `legacyUserId` themselves.

## Changing the schema

The tree in `supabase/schemas/` is the source of truth; **do not write a
migration**. Edit the SQL, and:

```bash
pnpm devtools db sync        # applies your edit to your database and regenerates the types
pnpm devtools supabase test db   # the RLS suite
```

Every table change needs a test in `supabase/tests/` that asserts what is
allowed **and** what is denied. A pull request shows the SQL it runs and the
type changes in its checks; a change that drops or rewrites data needs a DevOps
member to add `allow-destructive`.

The TypeScript types (`src/supabase/database.types.ts`) are generated and never
committed. `pnpm devtools db types --download` fetches the ones CI built for your
checkout if you would rather not run Docker.
