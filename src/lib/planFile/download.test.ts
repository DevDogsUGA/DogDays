import { describe, expect, it } from "vitest";
import { planFilename } from "./download";

describe("planFilename", () => {
  it("uses the title", () => {
    expect(planFilename("Sample")).toBe("Sample.dogdays.json");
  });

  it("falls back to plan when only punctuation is left", () => {
    expect(planFilename("?!/*.")).toBe("plan.dogdays.json");
    expect(planFilename("   ")).toBe("plan.dogdays.json");
  });

  it("replaces unsafe runs and collapses the separators around them", () => {
    expect(planFilename("  Fall & Spring / 2026  ")).toBe(
      "Fall-Spring-2026.dogdays.json",
    );
    expect(planFilename("..\\..\\etc")).toBe("etc.dogdays.json");
  });

  it("keeps spaces, underscores and non-ASCII letters", () => {
    expect(planFilename("My plan_v2")).toBe("My plan_v2.dogdays.json");
    expect(planFilename("Été 2026")).toBe("Été 2026.dogdays.json");
  });

  it("appends the extension exactly once", () => {
    expect(planFilename("Sample.dogdays.json")).toBe("Sample.dogdays.json");
    expect(planFilename("Sample.DOGDAYS.JSON")).toBe("Sample.dogdays.json");
    expect(planFilename(".dogdays.json")).toBe("plan.dogdays.json");
  });
});
