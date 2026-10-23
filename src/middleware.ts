import { type NextRequest } from "next/server";
import {
  applySecurityHeaders,
  CSP_HEADER,
  generateNonce,
  serializeCsp,
  type SecurityHeadersInput,
} from "@devdogsuga/sdk/headers";
import { updateSession } from "~/supabase/middleware";
import { env } from "~/env";
import { dogDaysCsp } from "~/config/csp";

// `/platform-moderation` is the signed webhook receiver: no session, the
// signature is the authentication.
const PUBLIC_PATHS = [
  "/",
  "/auth/callback",
  "/courses",
  "/plans",
  "/platform-moderation",
];

// Authoritative header application -- see @devdogsuga/sdk/headers'
// `applySecurityHeaders` doc comment for why middleware, not just
// next.config.ts's `headers()`: that mechanism drops these headers on `/`
// specifically (reproduced against a real `vinext build` + `wrangler dev`
// serve), apparently because `/` is the one route with no `Set-Cookie` on its
// response and so routes through vinext's CDN/cache response-stage
// reconciliation instead of the plain per-request header merge every cookied
// route gets. Middleware-set headers go through a separate, earlier merge
// that survives that reconciliation. next.config.ts's `headers()` stays wired
// too -- vinext skips re-setting a header middleware already set, so this is
// not a duplicate -- as a fallback for routes outside this middleware's
// matcher (static assets, images).
function withSecurityHeaders(
  response: Response,
  headersInput: SecurityHeadersInput,
): Response {
  // `Response.redirect()` (the `!user && !isPublic` branch below) returns a
  // Response whose `headers` guard is spec-"immutable" -- `.set()` on it
  // throws `TypeError: immutable`. Re-wrapping in `new Response(body, init)`
  // always yields a mutable copy, cheaply, whether or not the input needed
  // it (a `NextResponse.next()`'s headers were already mutable).
  const mutable = new Response(response.body, response);
  applySecurityHeaders(mutable.headers, headersInput);
  return mutable;
}

export async function middleware(request: NextRequest) {
  // Minted once per request and written onto the *request* headers below --
  // see `@devdogsuga/sdk/headers`' README.
  // vinext (like Next) reads the nonce for scripts/styles it emits itself
  // (bootstrap module, __NEXT_DATA__, font preloads) off the request's
  // Content-Security-Policy(-Report-Only) header, not the response's.
  const nonce = generateNonce();
  const csp = dogDaysCsp({
    environment: env.DEPLOY_ENV,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    catalogUrl: env.NEXT_PUBLIC_CATALOG_URL,
    sentryDsn: env.NEXT_PUBLIC_SENTRY_DSN,
    nonce,
  });
  const headersInput: SecurityHeadersInput = {
    environment: env.DEPLOY_ENV,
    csp,
  };
  // Mutates the live Headers instance on `request` -- `updateSession` below
  // eventually calls `NextResponse.next({ request })`, which reads this same
  // instance and encodes it as the middleware request-header override vinext
  // decodes server-side to rebuild the request `headers()` context every
  // downstream Server Component and the renderer itself observe.
  request.headers.set(CSP_HEADER, serializeCsp(csp));
  // Plain carrier for `RootLayout`'s/`global-error.tsx`'s hand-written
  // inline `<script>` tags (`headers().get("x-nonce")`) -- vinext parses the
  // nonce back out of the CSP header above for its OWN emitted scripts, but
  // there is no public API to ask it for that same value from application
  // code, so it travels twice, once in each shape its two consumers need.
  request.headers.set("x-nonce", nonce);

  const { supabaseResponse, user } = await updateSession(request);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)),
  );

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/";
    loginUrl.searchParams.set("next", pathname);
    return withSecurityHeaders(Response.redirect(loginUrl), headersInput);
  }

  return withSecurityHeaders(supabaseResponse, headersInput);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
