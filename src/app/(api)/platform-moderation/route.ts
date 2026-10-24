import { serverSecrets } from "~/env";
import { receiveModeration } from "~/server/moderation/receive";
import { supabaseReceiverDeps } from "~/server/moderation/supabase";

/**
 * Where the DevDogs platform delivers moderators' decisions and account
 * deletions (DogDays is registered as an external app; its endpoint URL is
 * `https://dogdays.dev/platform-moderation`). Authenticated by the Standard
 * Webhooks signature alone: middleware lets the path through without a session.
 * The rules and the message handling are in `~/server/moderation/receive`.
 */
export async function POST(request: Request) {
  const { moderationSecrets, serviceRoleKey } = serverSecrets();
  if (!serviceRoleKey) {
    console.error("SUPABASE_SECRET_KEY is not set");
    return Response.json(
      { status: 503, error: "not_configured" },
      { status: 503 },
    );
  }
  return receiveModeration(request, {
    secrets: moderationSecrets,
    ...supabaseReceiverDeps(serviceRoleKey),
  });
}
