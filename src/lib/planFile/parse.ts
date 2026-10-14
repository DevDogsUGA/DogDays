import { planFileSchema, type PlanFile } from "./schema";

export type ParseResult =
  { ok: true; plan: PlanFile } | { ok: false; error: string };

export function parsePlanFile(
  text: string,
  knownTerms?: readonly number[],
): ParseResult {
  try {
    const value: unknown = JSON.parse(text);
    const parsed = planFileSchema.safeParse(value);

    if (parsed.success) {
      return { ok: true, plan: parsed.data };
    }
    return { ok: false, error: "This is not a valid DogDays plan file." };
  } catch {
    return { ok: false, error: "This file is not valid JSON." };
  }
}
