#!/usr/bin/env bash
# Build the generated types for the schema as it is checked out, and upload
# them to the rolling `generated-types` release (Q82).
#
# `devtools db types --download` looks there for the asset named for the schema
# hash, so a contributor who cannot run Docker (or would rather not) still gets
# the exact types their checkout needs. The hash is devtools' own (`db hash`):
# sorted schema paths, LF-normalised contents, and the generator version (the
# pinned Supabase CLI).
#
# Idempotent: an asset that already exists is left alone, and about 200 assets
# are kept (the oldest go first).
#
# Environment:
#   GH_TOKEN        a token that can write releases (contents: write)
#   GITHUB_REPOSITORY  owner/name
#   SUPABASE, DEVTOOLS  as in db-check.sh
#   DRY_RUN         `true` builds and packs but uploads nothing
#   GENERATED_TYPES_TAG   the release tag; default `generated-types`
#   GENERATED_TYPES_KEEP  how many assets to keep; default 200
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
devtools=${DEVTOOLS:-pnpm dlx @devdogsuga/devtools@next}
repo=${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}
tag=${GENERATED_TYPES_TAG:-generated-types}
keep=${GENERATED_TYPES_KEEP:-200}
summary=${GITHUB_STEP_SUMMARY:-/dev/stderr}

# Until the `next` dist-tag of devtools is published there is nothing to run
# the hash with. That is a missing prerelease, not a broken schema, so say so
# (a warning annotation and the summary) instead of failing main. A custom
# DEVTOOLS (the tests, a local build) skips this check.
if [ -z "${DEVTOOLS:-}" ] && ! npm view @devdogsuga/devtools@next version >/dev/null 2>&1; then
  echo "::warning::@devdogsuga/devtools@next is not published yet, so no types were uploaded for this schema."
  echo "@devdogsuga/devtools@next is not published yet: uploaded nothing. Re-run this workflow (workflow_dispatch) once the prerelease exists." >>"$summary"
  exit 0
fi

# shellcheck disable=SC2086
hash=$($devtools db hash)
product=$(node -p "require('./devtools.config.json').product")
asset="${product}-types-${hash}.tgz"
out_path=$(node -p "require('./devtools.config.json').types.out")

# The assets endpoint is paginated (the release object itself is not a safe
# place to count from once there are hundreds).
# A missing release makes gh print its 404 body on stdout, so only a number counts.
release_id() {
  local id
  id=$(gh api "repos/$repo/releases/tags/$tag" --jq .id 2>/dev/null || true)
  if [[ "$id" =~ ^[0-9]+$ ]]; then echo "$id"; fi
}
release_assets() { gh api --paginate "repos/$repo/releases/$1/assets?per_page=100" --jq "$2"; }

rid=$(release_id)
if [ "${DRY_RUN:-false}" != true ] && [ -n "$rid" ] && release_assets "$rid" '.[].name' | grep -x "$asset" >/dev/null; then
  echo "$asset is already on the $tag release." | tee -a "$summary"
  exit 0
fi

trap '"$here/db-stack.sh" down' EXIT
"$here/db-stack.sh" up
"$here/db-types.sh"

out=$(mktemp -d)/"$asset"
# `db types --download` unpacks <basename of types.out> from the archive.
tar -czf "$out" -C "$(dirname "$out_path")" "$(basename "$out_path")"
echo "Packed $out_path into $asset ($(du -h "$out" | cut -f1))." | tee -a "$summary"

if [ "${DRY_RUN:-false}" = true ]; then
  cp "$out" "./$asset"
  echo "Dry run: wrote ./$asset, uploaded nothing." | tee -a "$summary"
  exit 0
fi

if [ -z "$rid" ]; then
  gh release create "$tag" --repo "$repo" --prerelease --latest=false \
    --title "Generated types" \
    --notes "TypeScript types generated from supabase/schemas, one asset per schema hash. Rolling: CI adds an asset on every schema change and keeps about $keep. \`devtools db types --download\` fetches the one for your checkout. Not a release of the app."
fi
gh release upload "$tag" "$out" --repo "$repo" --clobber
echo "Uploaded $asset to the $tag release." | tee -a "$summary"

# Keep the newest $keep assets.
rid=$(release_id)
release_assets "$rid" '.[] | [.created_at, .id] | @tsv' |
  sort -r | tail -n +$((keep + 1)) | cut -f2 |
  while read -r id; do
    gh api -X DELETE "repos/$repo/releases/assets/$id" >/dev/null
    echo "Removed old asset $id (more than $keep kept)." | tee -a "$summary"
  done
