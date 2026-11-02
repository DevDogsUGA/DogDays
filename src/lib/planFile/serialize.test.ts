import { describe, expect, it } from "vitest";
import type { SavedPlan } from "../localStorage/types";
import { PLAN_NAME_MAX, planFileSchema } from "./schema";
import { serializePlanFile } from "./serialize";

const SAVED: SavedPlan = {
  id: "fixture",
  userId: "user-1",
  academicPeriod: 202702,
  title: "Sample",
  crns: [12345],
  courseIds: [],
  pinned: true,
  createdAt: "2026-10-12T12:00:00Z",
  updatedAt: "2026-10-12T12:00:00Z",
};

const GOOD = {
  version: 1 as const,
  term: 202702,
  name: "Sample",
  crns: [12345],
  pinned: true,
};

const write = (saved: SavedPlan) =>
  JSON.parse(serializePlanFile(saved)) as Record<string, unknown>;

describe("writing a .dogdays.json file", () => {
  it("writes a plan", () => {
    expect(write(SAVED)).toEqual(GOOD);
  });

  it("leaves out account and saved-record details", () => {
    expect(Object.keys(write(SAVED)).sort()).toEqual([
      "crns",
      "name",
      "pinned",
      "term",
      "version",
    ]);
  });

  it("reads back through the schema", () => {
    expect(planFileSchema.parse(write(SAVED))).toEqual(GOOD);
  });

  it("trims the name", () => {
    expect(write({ ...SAVED, title: "  Sample  " }).name).toBe("Sample");
  });

  it.each([
    ["no CRNs", { ...SAVED, crns: [] }],
    ["a repeated CRN", { ...SAVED, crns: [12345, 12345] }],
    ["a blank name", { ...SAVED, title: "   " }],
    [
      "a name that is too long",
      { ...SAVED, title: "x".repeat(PLAN_NAME_MAX + 1) },
    ],
    [
      "a term that is not a registrar term",
      { ...SAVED, academicPeriod: 202707 },
    ],
  ])("refuses %s", (_label, saved) => {
    expect(() => serializePlanFile(saved)).toThrow();
  });
});
