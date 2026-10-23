import { createClient } from "@supabase/supabase-js";
import * as z from "zod";
import { env } from "~/env";
import { APP_SCHEMA } from "~/supabase/schema";
import type { ApplyOutcome, ReceiverDeps } from "./receive";

const outcomeSchema = z.object({
  outcome: z.enum(["applied", "duplicate", "stale"]),
  userId: z.uuid().nullable(),
});

/**
 * The receiver's side effects against this project, with the service role.
 * Untyped on purpose: the generated `Database` types are a build artifact, and
 * this is one RPC with a result parsed below.
 */
export function supabaseReceiverDeps(
  serviceRoleKey: string,
): Pick<ReceiverDeps, "apply" | "deleteUser"> {
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    db: { schema: APP_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    async apply(id, body): Promise<ApplyOutcome> {
      const { data, error } = await client.rpc("apply_moderation_event", {
        p_id: id,
        p_message: JSON.parse(body) as unknown,
      });
      if (error) throw error;
      return outcomeSchema.parse(data);
    },
    async deleteUser(userId) {
      const { error } = await client.auth.admin.deleteUser(userId);
      // Deleted between the lookup and the call: that is what we wanted.
      if (error && error.status !== 404 && error.code !== "user_not_found") {
        throw error;
      }
    },
  };
}
