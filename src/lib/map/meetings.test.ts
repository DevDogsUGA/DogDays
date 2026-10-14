import { describe, expect, it } from "vitest";
import type { Section } from "../domain/section";
import { groupMeetingsByDay } from "./meetings";

function makeSection(overrides: Partial<Section>): Section {
  return {
    crn: 12345,
    courseAbbr: "CSCI1302",
    courseNumber: "1302",
    courseTitle: "Software Development",
    creditHours: { min: 4, max: 4 },
    campus: { id: 1, abbr: "ATH", description: "Athens" },
    professor: null,
    seatsAvailable: 0,
    actualEnrollment: 0,
    maximumEnrollment: 0,
    cancelled: false,
    lastSeenAt: new Date(0),
    academicPeriod: 202608,
    dateRange: null,
    meetings: [],
    ...overrides,
  };
}

describe("groupMeetingsByDay", () => {
  it("puts an MWF meeting once under each of its days", () => {
    const section = makeSection({
      meetings: [
        {
          days: ["monday", "wednesday", "friday"],
          startTime: "9:10",
          endTime: "10:00",
          building: null,
          room: null,
        },
      ],
    });

    const result = groupMeetingsByDay([section]);

    expect(result.monday).toHaveLength(1);
    expect(result.wednesday).toHaveLength(1);
    expect(result.friday).toHaveLength(1);
    expect(result.tuesday).toHaveLength(0);
  });
});
