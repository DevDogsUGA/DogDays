import { PLAN_FILE_EXTENSION } from "./schema";

export function planFilename(title: string): string {
  let baseName = title.trim();
  if (baseName.toLowerCase().endsWith(PLAN_FILE_EXTENSION)) {
    baseName = baseName.slice(0, -PLAN_FILE_EXTENSION.length);
  }
  baseName = baseName
    .replace(/[^\p{L}\p{N} _-]+/gu, "-")
    .replace(/[ _-]*-[ _-]*/g, "-")
    .replace(/^[ _-]+|[ _-]+$/g, "");
  return `${baseName || "plan"}${PLAN_FILE_EXTENSION}`;
}
