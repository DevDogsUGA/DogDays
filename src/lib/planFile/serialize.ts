import type { SavedPlan } from "../localStorage/types";
import { PLAN_FILE_VERSION, planFileSchema } from "./schema";

export function serializePlanFile(saved: SavedPlan): string {
  return JSON.stringify(
    planFileSchema.parse({
      version: PLAN_FILE_VERSION,
      term: saved.academicPeriod,
      name: saved.title,
      crns: saved.crns,
      pinned: saved.pinned,
    }),
  );
}
