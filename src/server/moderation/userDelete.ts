/**
 * The `user.delete` moderation message, accepted locally.
 *
 * The published @devdogsuga/sdk (`parseMessage`) does not carry it yet:
 * DevDogsUGA PR #215 adds it to USER_MESSAGE_TYPES, the receiver and sdk-spec.
 * Same wire shape as the other user messages. Delete this file and use
 * `parseMessage` alone once the pinned sdk includes #215.
 */
import * as z from "zod";

export const userDeleteMessageSchema = z.object({
  type: z.literal("user.delete"),
  timestamp: z.iso.datetime(),
  data: z.object({
    userId: z.uuid(),
    reason: z.string().max(1000).nullable(),
    reportId: z.uuid().nullable(),
  }),
});
export type UserDeleteMessage = z.infer<typeof userDeleteMessageSchema>;

export function parseUserDelete(body: string): UserDeleteMessage | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const parsed = userDeleteMessageSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
