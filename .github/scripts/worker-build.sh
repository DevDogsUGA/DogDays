#!/usr/bin/env bash
# Build the Worker for one tier, from the variables of its GitHub environment.
#
# deploy-worker.yaml hands this script (as its `prepare_command`) the whole
# `vars` context as JSON in DEPLOY_GITHUB_VARS: the one step that may read it.
# The browser values (NEXT_PUBLIC_*) are inlined into the bundle at build time,
# which is why they are read here and not at runtime. Nothing in them is a
# secret. The moderation receiver's two secrets (PLATFORM_MODERATION_SECRET and
# SECRET_KEY, secrets of the GitHub environment) come from
# DEPLOY_GITHUB_SECRETS and leave in a 0600 file that the upload commands hand
# to wrangler's --secrets-file, so they become Worker secrets, not plain vars.
#
# Environment: TIER (staging | production), DEPLOY_GITHUB_VARS.
# Writes SENTRY_DSN (and WORKER_SECRETS_FILE, when the environment has the
# moderation secrets) to $GITHUB_ENV for the upload step, and builds dist/.
set -euo pipefail

tier=${TIER:?TIER is required}
vars=${DEPLOY_GITHUB_VARS:?DEPLOY_GITHUB_VARS is required}

get() { jq -r --arg k "$1" '.[$k] // empty' <<<"$vars"; }
need() {
  local value
  value=$(get "$1")
  if [ -z "$value" ]; then
    echo "::error::The $tier environment has no $1 variable." >&2
    exit 1
  fi
  printf '%s' "$value"
}

NEXT_PUBLIC_SUPABASE_URL=$(need API_URL)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$(need PUBLISHABLE_KEY)
NEXT_PUBLIC_CATALOG_URL=$(need CATALOG_URL)
NEXT_PUBLIC_SENTRY_DSN=$(get SENTRY_DSN)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$(get GOOGLE_MAPS_API_KEY)
export NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY NEXT_PUBLIC_CATALOG_URL \
  NEXT_PUBLIC_SENTRY_DSN NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
export NEXT_PUBLIC_DEPLOY_ENV=$tier DEPLOY_ENV=$tier
# The Cloudflare Vite plugin resolves wrangler.jsonc's `env.<tier>` block into
# dist/server/wrangler.json, so the upload needs no `-e`.
export CLOUDFLARE_ENV=$tier

pnpm build

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN" >>"$GITHUB_ENV"
fi

# The receiver answers 503 until both exist, which never blocks a deploy.
secrets=${DEPLOY_GITHUB_SECRETS:-}
[ -n "$secrets" ] || secrets='{}'
moderation_secret=$(jq -r '.PLATFORM_MODERATION_SECRET // empty' <<<"$secrets")
secret_key=$(jq -r '.SECRET_KEY // empty' <<<"$secrets")
if [ -n "$moderation_secret" ] && [ -n "$secret_key" ] && [ -n "${GITHUB_ENV:-}" ]; then
  file="${RUNNER_TEMP:-/tmp}/worker-secrets.json"
  (
    umask 077
    jq -n --arg m "$moderation_secret" --arg k "$secret_key" \
      '{PLATFORM_MODERATION_SECRET: $m, SUPABASE_SECRET_KEY: $k}' >"$file"
  )
  echo "WORKER_SECRETS_FILE=$file" >>"$GITHUB_ENV"
else
  echo "::notice::The $tier environment has no PLATFORM_MODERATION_SECRET and SECRET_KEY secrets: the moderation receiver answers 503 until it does."
fi
