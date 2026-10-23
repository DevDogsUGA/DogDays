---
name: Deployment
description: How DogDays gets from a merge to dogdays.dev, and the values nothing cross-checks.
order: 10
section: infrastructure
---

# Deployment

You never deploy. A merge to `main` runs `.github/workflows/deploy.yaml`, which
DevOps owns.

- **Staging** (`staging.dogdays.dev`, Worker `staging-dogdays`, database project
  `dogdays-staging`) follows `main`: the database through the shared deploy
  blocks, then the Worker.
- **Production** (`dogdays.dev`, Worker `production-dogdays`, database project
  `dogdays`) waits for a DevOps approval, and the catalog check first: the
  production catalog must serve the current and the next term.

The hostnames are `custom_domain` routes in `wrangler.jsonc`, and the same
hostnames are the `BASE_URL` values of the GitHub environments and the Supabase
`site_url`. Nothing cross-checks them. A mismatch is not a build failure; it is a
sign-in that returns to the wrong place.

## What a build needs

The browser values (`NEXT_PUBLIC_*`) are inlined **at build time**, so they come
from the GitHub environment's variables (`API_URL`, `PUBLISHABLE_KEY`,
`CATALOG_URL`), not from the Worker. The Worker itself only needs `DEPLOY_ENV`
(from `wrangler.jsonc`) and, when Sentry is on, `SENTRY_DSN` and
`SENTRY_RELEASE`. The only secrets are the moderation receiver's, below.

## The moderation receiver's secrets

`/platform-moderation` ([how it works](../guides/moderation.md)) needs two
Worker secrets. They are secrets of the `staging` and `production` GitHub
environments, `PLATFORM_MODERATION_SECRET` and `SERVICE_ROLE_KEY`. The deploy
(`.github/scripts/worker-build.sh`) writes them to a file that
`wrangler ... --secrets-file` uploads as the Worker's
`PLATFORM_MODERATION_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`. Without both the
route answers 503 and nothing else changes. Never set them on the Worker
directly: the next deploy would not remove them, but a rotated value in GitHub
would silently lose to a stale one.

In-app branding is **DogDays** throughout (mark and copy from
`@devdogsuga/sdk/brand`), with its own light/dark zinc-and-red design driven by
system `prefers-color-scheme`, not the platform's design language.

## Setting the environment's values

Once DogDays' Bitwarden projects (`dogdays-preflight`, `dogdays-staging`,
`dogdays-production`) are provisioned, set a GitHub environment's variables and
secrets with `pnpm backstage env push --repo dogdays --target <target>` from a
DevDogsUGA checkout (its root script runs `@devdogsuga/backstage@next`) instead
of `gh secret set`, and compare the file, Bitwarden and GitHub with
`pnpm backstage env audit --repo dogdays --target <target>`. The file is
`.env.<target>` in this checkout, which git ignores.
