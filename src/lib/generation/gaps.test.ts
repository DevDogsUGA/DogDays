import { describe, expect, it } from "vitest";
import type {
  DateRange,
  DayOfWeek,
  Meeting,
  Section,
} from "~/lib/domain/section";
import { flattenTimedMeetings } from "./gaps";

function meeting(
  startTime: string | null,
  endTime: string | null,
  days: DayOfWeek[] = ["monday"],
): Meeting {
  return { days, startTime, endTime, building: null, room: null };
}

function section(
  crn: number,
  meetings: Meeting[],
  dateRange: DateRange | null = { start: "2026-01-01", end: "2026-05-01" },
): Section {
  return {
    crn,
    courseAbbr: "CSCI",
    courseNumber: "1301",
    courseTitle: "Intro to Computing",
    creditHours: { min: 3, max: 3 },
    campus: { id: 1, abbr: "ATH", description: "Athens" },
    professor: null,
    seatsAvailable: 10,
    actualEnrollment: 0,
    maximumEnrollment: 10,
    cancelled: false,
    lastSeenAt: new Date(),
    academicPeriod: 202608,
    dateRange,
    meetings,
  };
}

describe("flattenTimedMeetings", () => {
  it("converts HH:mm times to minutes since midnight", () => {
    const [m] = flattenTimedMeetings([
      section(1, [meeting("13:00:00", "14:15:30")]),
    ]);
    expect(m?.startMinutes).toBe(780);
    expect(m?.endMinutes).toBe(855);
  });

  it("ignores seconds in HH:mm:ss times", () => {
    const [m] = flattenTimedMeetings([
      section(1, [meeting("13:00:00", "14:15:30")]),
    ]);
    expect(m?.startMinutes).toBe(780);
    expect(m?.endMinutes).toBe(855);
  });

  it("skips meetings with a null start or end time", () => {
    const s = section(1, [
      meeting(null, null),
      meeting("09:00", null),
      meeting(null, "09:50"),
    ]);
    expect(flattenTimedMeetings([s])).toEqual([]);
  });

  it("keeps separate meetings separate, indexed by position in section.meetings", () => {
    const range: DateRange = { start: "2026-05-11", end: "2026-05-29" };
    const s = section(
      42,
      [
        meeting("09:00", "09:50", ["monday", "wednesday"]),
        meeting(null, null),
        meeting("14:00", "16:45", ["friday"]),
      ],
      range,
    );

    expect(flattenTimedMeetings([s])).toEqual([
      {
        crn: 42,
        meetingIndex: 0,
        days: ["monday", "wednesday"],
        startMinutes: 540,
        endMinutes: 590,
        dateRange: range,
      },
      {
        crn: 42,
        meetingIndex: 2,
        days: ["friday"],
        startMinutes: 840,
        endMinutes: 1005,
        dateRange: range,
      },
    ]);
  });

  it("copies a null dateRange through unchanged", () => {
    const [m] = flattenTimedMeetings([
      section(1, [meeting("09:00", "09:50")], null),
    ]);
    expect(m?.dateRange).toBeNull();
  });
});
