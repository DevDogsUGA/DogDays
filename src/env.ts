/**
 * The app's environment, validated once.
 *
 * Everything the browser reads is `NEXT_PUBLIC_*` and public by construction:
 * the same values ship in `.env.example`, which `devtools setup` copies into
 * `.env`. Nothing here is a secret. The app has no server secret at all: the
 * catalog is public and keyless, and the member's own data goes through
 * Supabase with the member's own session, so Row Level Security is the only
 * gate. The one exception is the moderation receiver, which runs with the
 * service role: its two secrets are read at request time by `serverSecrets()`
 * below and nowhere else.
 *
 * `NEXT_PUBLIC_*` values are inlined into the browser bundle by STATIC
 * analysis, so each one below is read as the literal text
 * `process.env.NEXT_PUBLIC_FOO`. A computed lookup would be `undefined` in
 * the browser.
 *
 * `SKIP_ENV_VALIDATION=1` is for the commands that only need the file to load
 * (`vinext typegen`, the unit tests): required values fall back to
 * placeholders instead of throwing.
 */
import * as z from "zod";

export const DEPLOY_ENVIRONMENTS = [
  "development",
  "staging",
  "production",
] as const;
export type DeployEnvironment = (typeof DEPLOY_ENVIRONMENTS)[number];

const STAGING_CATALOG = "https://api-staging.devdogsuga.org/catalog/v1";

const skip = !!process.env.SKIP_ENV_VALIDATION;

/** `""` is unset: `.env.example` lists every key, most of them blank. */
const blank = (value: unknown) => (value === "" ? undefined : value);

const clientSchema = z.object({
  NEXT_PUBLIC_DEPLOY_ENV: z.preprocess(
    blank,
    z.enum(DEPLOY_ENVIRONMENTS).default("development"),
  ),
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(
    blank,
    skip ? z.url().default("http://localhost:54321") : z.url(),
  ),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.preprocess(
    blank,
    skip ? z.string().default("skip-env-validation") : z.string().min(1),
  ),
  /** The platform catalog API, read straight from the browser (public, CORS open). */
  NEXT_PUBLIC_CATALOG_URL: z.preprocess(
    blank,
    z.url().default(STAGING_CATALOG),
  ),
  /** Maps JavaScript API browser key: referrer-restricted and quota-capped in Google Cloud, public by design. */
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.preprocess(blank, z.string().optional()),
  /** Empty skips `Sentry.init` entirely (local development). */
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(blank, z.url().optional()),
});

const clientValues = clientSchema.parse({
  NEXT_PUBLIC_DEPLOY_ENV: process.env.NEXT_PUBLIC_DEPLOY_ENV,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_CATALOG_URL: process.env.NEXT_PUBLIC_CATALOG_URL,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

export const env = {
  ...clientValues,
  /** The same value as `NEXT_PUBLIC_DEPLOY_ENV`, under the name the server code reads. */
  DEPLOY_ENV: clientValues.NEXT_PUBLIC_DEPLOY_ENV,
};

export type Env = typeof env;

/**
 * The moderation receiver's secrets (`src/app/(api)/platform-moderation`),
 * Worker secrets set by the deploy (`.github/scripts/worker-build.sh` writes
 * them from the GitHub environment's secrets). Read per request, never at
 * module scope: a secret is not there while the app builds, and a missing one
 * must answer 503 rather than break every page.
 *
 * - `PLATFORM_MODERATION_SECRET`: the `whsec_...` signing secret of DogDays'
 *   OAuth client, shown once when an officer registers it as an external app.
 *   Comma separated while a rotation is in flight.
 * - `SUPABASE_SECRET_KEY`: this project's secret key (`sb_secret_...`), for the
 *   moderation function and the admin API's user delete.
 *
 * Locally, put them in `.env.local` (git ignores it). Without them the route
 * answers 503 and the rest of the app is unaffected.
 */
export function serverSecrets(): {
  moderationSecrets: string[];
  serviceRoleKey: string | undefined;
} {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  return {
    moderationSecrets: (process.env.PLATFORM_MODERATION_SECRET ?? "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean),
    serviceRoleKey: key === "" ? undefined : key,
  };
}
