---
name: Moderation receiver
description: How DogDays receives the DevDogs platform's moderation decisions and account deletions, and what each message does.
order: 22
section: guides
---

# Moderation receiver

DogDays is an app outside the platform's database, so the platform tells it
about decisions over HTTPS. When a member deletes their DevDogs account, DogDays
deletes theirs too. The platform side is described in its
"Apps outside the platform database" guide (DevDogsUGA `docs/platform/guides/moderation/external-apps.md`); this page is DogDays' half.

`POST /platform-moderation` (a Next route, `src/app/(api)/platform-moderation`)
is a Worker route and not a Supabase function because DogDays deploys as a
Worker and has no Edge Functions pipeline. Middleware lets it through without a
session: the [Standard Webhooks](https://www.standardwebhooks.com/) signature is
the authentication.

| Rule | Where |
| --- | --- |
| Signed | `src/server/moderation/receive.ts` checks `webhook-signature` with `@devdogsuga/sdk/moderation`'s `verifyMessage`. A bad signature, or a timestamp more than five minutes off, answers 401. |
| Idempotent | `dogdays.apply_moderation_event` records the `webhook-id` in `moderation.events`; a replay answers `duplicate`. |
| Order-safe | The same function: a message older than the last decision on the same item answers `stale`. |
| Retried safely | Anything that is not an application answers 2xx. A database or admin API failure answers 500, and because the id and the change commit together, the retry is applied. |

## What each message does

| Message | DogDays |
| --- | --- |
| `user.suspend`, `user.ban` | The member cannot sign in (`banned_until`), and their sessions are revoked. |
| `user.restore` | Lifts it. |
| `user.delete` | Locks the account, records the state as `deleted` with no reason, deletes the copied rows keyed by the platform id (`legacyUserId`), then deletes the auth user through the admin API. Every member table cascades from `auth.users`. An unknown user and a repeat answer 2xx. The member can sign in again later and gets a new, empty account. |
| `content.*` | Recorded only. DogDays holds no content written by members that other members see. |

A ban or suspension that arrives before the person has signed in to DogDays is
recorded in `moderation.user_states` but does not stop their first sign-in.
The `moderation` tables never reference a member, so deleting an account does
not touch them: they hold only the platform's own user id and message ids.

`user.delete` is accepted by `src/server/moderation/userDelete.ts` because the
published `@devdogsuga/sdk` does not carry it yet
([DevDogsUGA #215](https://github.com/DevDogsUGA/DevDogsUGA/pull/215)). Delete
that file when the pinned sdk does.

## Registering DogDays

An officer who holds `canManageOAuthApps` does this once per environment:

1. On the platform's `/tools/oauth`, make DogDays' **production** OAuth client
   (the one its sign-in uses).
2. On the moderation console, **Apps Outside the Platform**, register it: slug
   `dogdays`, name `DogDays`, the client id, the endpoint URL
   `https://dogdays.dev/platform-moderation` (staging:
   `https://staging.dogdays.dev/platform-moderation`), and no content types
   that need a link (DogDays has none to report).
3. The console shows the client's signing secret (`whsec_...`) once. Store it as
   the `PLATFORM_MODERATION_SECRET` secret of the matching GitHub environment,
   next to `SERVICE_ROLE_KEY` (this project's service-role key), and redeploy.
   Lost it? Rotate it on `/tools/oauth` under **Moderation**.

## Testing

`pnpm test` runs `src/server/moderation/*.test.ts` (signature, replay, stale,
`user.delete` known, unknown and repeated). `supabase/tests/dogdays_moderation.test.sql`
runs in the `database` check. Locally, `pnpm devtools moderation send user.ban`
signs a message and posts it to your running app (set
`PLATFORM_MODERATION_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`).
