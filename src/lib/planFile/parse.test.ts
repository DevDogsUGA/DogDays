import { describe, expect, it } from "vitest";
import { parsePlanFile } from "./parse";

const SAMPLE = {
  version: 1,
  term: 202702,
  name: "Sample",
  crns: [12345],
  pinned: false,
};

describe("parsePlanFile", () => {
  it("accepts the sample plan", () => {
    expect(parsePlanFile(JSON.stringify(SAMPLE))).toEqual({
      ok: true,
      plan: SAMPLE,
    });
  });

  it("refuses text that is not JSON", () => {
    expect(parsePlanFile("not valid json")).toEqual({
      ok: false,
      error: "This file is not valid JSON.",
    });
  });

  it("refuses a plan with no crns", () => {
    expect(
      parsePlanFile(JSON.stringify({ ...SAMPLE, crns: undefined })),
    ).toEqual({
      ok: false,
      error: "This is not a valid DogDays plan file.",
    });
  });
});
