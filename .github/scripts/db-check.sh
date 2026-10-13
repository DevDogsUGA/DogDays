#!/usr/bin/env bash
# The `database` job: what a pull request does to the schema, shown and tested.
#
#   1. The schema tree applies to an empty database, and applying it a second
#      time changes nothing (a tree that does not settle would plan a change at
#      every deploy).
#   2. The RLS suite (pgTAP, supabase/tests/) passes against it, and so does
#      the legacy copy and claim test (legacy-copy.test.sh).
#   3. The TypeScript types generate from it, and the type changes against the base
#      branch go in the job summary. The SQL the change runs is in the summary
#      of `destructive-gate / destructive-sql`, from the same plan the deploy
#      reads.
#
# A repository with no schema yet passes: there is nothing to check. A schema
# with no RLS suite fails: every table needs its allow and its deny asserted.
#
# Environment:
#   BASE_SHA           the commit the pull request is compared with (required)
#   SUPABASE           the CLI to run; default `supabase`
#   DEVTOOLS           how to run devtools; default `pnpm dlx @devdogsuga/devtools@next`
#   GITHUB_TOKEN       lifts the anonymous API limit when downloading the base types
#   GITHUB_STEP_SUMMARY  the markdown summary is appended here when set
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
supabase=${SUPABASE:-supabase}
devtools=${DEVTOOLS:-pnpm dlx @devdogsuga/devtools@next}
summary=${GITHUB_STEP_SUMMARY:-/dev/stderr}
base=${BASE_SHA:?BASE_SHA is required}

note() { printf '%s\n' "$*" >>"$summary"; }

has_sql() { [ -d "$1" ] && [ -n "$(find "$1" -name '*.sql' -print -quit)" ]; }

if ! has_sql supabase/schemas; then
  note '### Database'
  note ''
  note 'No schema under `supabase/schemas/` yet: nothing to apply, test or generate.'
  exit 0
fi

if [ ! -f supabase/config.toml ]; then
  echo "supabase/config.toml is missing: a schema tree needs the project's config to start a stack." >&2
  exit 1
fi
if ! has_sql supabase/tests; then
  echo "supabase/schemas has SQL but supabase/tests has no pgTAP file. Every table needs RLS tests that assert an allow and a deny." >&2
  exit 1
fi

trap '"$here/db-stack.sh" down' EXIT
"$here/db-stack.sh" up

# 1. Does the tree settle? A second sync that still finds a difference means
# the declared schema and the database it produced disagree.
before=$(find supabase/migrations -name '*.sql' | wc -l)
"$supabase" db schema declarative sync --apply --strict-coverage --name settle >/dev/null
after=$(find supabase/migrations -name '*.sql' | wc -l)
if [ "$after" -ne "$before" ]; then
  echo "Applying supabase/schemas a second time still produced a migration. The tree does not settle:" >&2
  find supabase/migrations -name '*_settle.sql' -exec cat {} + >&2
  exit 1
fi

# 2. The RLS suite.
"$supabase" test db

# 2b. The copy of the old DogDays data and the claim, end to end, against a
# stand-in for the platform's tables (legacy-copy.test.sh).
"$here/legacy-copy.test.sh"

# 3. The types, and what changed in them.
"$here/db-types.sh"

note '### Database'
note ''
note "The schema tree applies to an empty database and settles; the RLS suite passes ($(find supabase/tests -name '*.sql' | wc -l) file(s))."
note ''

types_out=$(node -p "require('./devtools.config.json').types.out")
base_dir=$(mktemp -d)
# The base branch's types are the ones main's CI uploaded for its schema hash.
# No upload (a first schema, an unpublished devtools) is said so, not guessed.
paths=()
for path in devtools.config.json supabase/schemas; do
  if [ -n "$(git ls-tree --name-only "$base" -- "$path")" ]; then paths+=("$path"); fi
done
if [ "${#paths[@]}" -gt 0 ]; then
  git archive "$base" -- "${paths[@]}" | tar -x -C "$base_dir"
fi
base_known=false
if [ -d "$base_dir/supabase/schemas" ]; then
  # shellcheck disable=SC2086
  if (cd "$base_dir" && $devtools db types --download >&2); then
    base_known=true
  fi
else
  # The base has no schema: every type is new.
  base_known=true
fi

if [ "$base_known" = true ]; then
  # Compared as a/ and b/ so the diff headers name the file, not a temp directory.
  mkdir -p "$base_dir/cmp/a/$(dirname "$types_out")" "$base_dir/cmp/b/$(dirname "$types_out")"
  if [ -f "$base_dir/$types_out" ]; then cp "$base_dir/$types_out" "$base_dir/cmp/a/$types_out"; fi
  cp "$types_out" "$base_dir/cmp/b/$types_out"
  if (cd "$base_dir/cmp" && diff -ruN a b) >"$base_dir/types.diff"; then
    note "#### Type changes"
    note ''
    note "None: the generated types (\`$types_out\`) are the same as on the base branch."
  else
    note "#### Type changes"
    note ''
    note '<details open><summary>TypeScript types, base branch to this change</summary>'
    note ''
    note '```diff'
    head -c 60000 "$base_dir/types.diff" >>"$summary"
    note ''
    note '```'
    note ''
    note '</details>'
  fi
else
  note "#### Type changes"
  note ''
  note "The base branch's generated types were not found (no \`generated-types\` upload for its schema yet), so there is nothing to compare with. This change generates \`$types_out\`, uploaded as the \`types\` artifact."
fi
