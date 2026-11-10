import { describe, expect, it } from "vitest";
import { escapeIcsText } from "./text";

describe("escapeIcsText", () => {
  it("escapes commas, semicolons, and a newline in a location", () => {
    expect(escapeIcsText("Building, Room;A\nNext")).toBe(
      "Building\\, Room\\;A\\nNext",
    );
  });
});
