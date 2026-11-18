import { afterEach, describe, expect, it } from "vitest";
import { formatLocalDateTime } from "./dateTime";

const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe("formatLocalDateTime", () => {
  it("joins a date and an HH:mm time, defaulting seconds to 00", () => {
    expect(formatLocalDateTime("2026-08-12", "09:10")).toBe("20260812T091000");
  });
  it("joins a date and an HH:mm:ss time, preserving seconds", () => {
    expect(formatLocalDateTime("2026-08-12", "09:10:30")).toBe(
      "20260812T091030",
    );
  });
  it.each(["UTC", "America/New_York", "Asia/Tokyo", "Pacific/Honolulu"])(
    "gives the same result when the machine timezone is %s",
    (tz) => {
      process.env.TZ = tz;
      expect(formatLocalDateTime("2026-08-12", "09:10")).toBe(
        "20260812T091000",
      );
    },
  );
});
