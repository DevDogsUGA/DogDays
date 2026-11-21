/**
 * The moderation receiver: where the DevDogs platform delivers moderators'
 * decisions and account deletions.
 *
 * The three rules every receiver keeps, and where each lives:
 *   1. signed       verified here against the per-app secret; 401 else. The
 *                   verification also rejects a delivery whose timestamp is
 *                   more than five minutes from this clock (a stale or replayed
 *                   capture).
 *   2. idempotent   `dogdays.apply_moderation_event` records the webhook id.
 *   3. order-safe   the same function: older than the last decision is stale.
 * Everything that is not an application answers 2xx so the platform stops
 * retrying. Only a database or admin API failure answers 5xx, which it retries
 * with the message intact, because the function records the id and the change
 * together.
 *
 * The side effects are injected so the unit tests need no database.
 */
import { parseMessage, verifyMessage } from "@devdogsuga/sdk/moderation";
import { parseUserDelete } from "./userDelete";

export type ApplyOutcome = {
  outcome: "applied" | "duplicate" | "stale";
  /** The DogDays auth user linked to the DevDogs identity, for user.* messages. */
  userId: string | null;
};

export type ReceiverDeps = {
  /** Signing secrets; several while a rotation is in flight. */
  secrets: readonly string[];
  /** `dogdays.apply_moderation_event`. Throws on a database failure. */
  apply: (id: string, body: string) => Promise<ApplyOutcome>;
  /** The admin API's user delete. An already-deleted user is not an error. */
  deleteUser: (userId: string) => Promise<void>;
  /** Unix seconds, for tests. */
  now?: number;
};

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

export async function receiveModeration(
  request: Request,
  deps: ReceiverDeps,
): Promise<Response> {
  if (request.method !== "POST") return new Response(null, { status: 405 });

  if (deps.secrets.length === 0) {
    console.error("PLATFORM_MODERATION_SECRET is not set");
    return json(503, { status: 503, error: "not_configured" });
  }

  const body = await request.text();
  const verified = await verifyMessage(
    deps.secrets,
    request.headers,
    body,
    deps.now === undefined ? undefined : { now: deps.now },
  );
  if (!verified.ok) return json(401, { status: 401, error: verified.reason });

  const deletion = parseUserDelete(body);
  if (!deletion && !parseMessage(body)) {
    // Signed but not a message this version understands (a newer schema, say).
    // A retry cannot fix it, so answer 2xx.
    return json(200, { status: "ignored", reason: "unsupported_message" });
  }

  try {
    const result = await deps.apply(verified.id, body);
    // user.delete: the function locked the account and recorded the id; the
    // auth user is removed here and DogDays' foreign keys cascade the rest. It
    // runs on 'duplicate' too, so a retry after a failed admin call finishes
    // the job, and whatever the ordering outcome, because deletion is final.
    // An unknown user (no linked account) or one already deleted is a success.
    if (deletion && result.userId) await deps.deleteUser(result.userId);
    return json(200, { status: 200, outcome: result.outcome });
  } catch (error) {
    console.error("platform-moderation failed", verified.id, error);
    return json(500, { status: 500, error: "apply_failed" });
  }
}
