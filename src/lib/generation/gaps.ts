import type { DateRange, DayOfWeek, Section } from "~/lib/domain/section";
import { timeToMinutes } from "~/lib/generation/noConflicts";

export type TimedMeeting = {
  crn: number;
  meetingIndex: number;
  days: DayOfWeek[];
  startMinutes: number;
  endMinutes: number;
  dateRange: DateRange | null;
};

export function flattenTimedMeetings(
  sections: readonly Section[],
): TimedMeeting[] {
  const result: TimedMeeting[] = [];
  for (const section of sections) {
    section.meetings.forEach((meeting, meetingIndex) => {
      if (meeting.startTime === null || meeting.endTime === null) return;
      result.push({
        crn: section.crn,
        meetingIndex,
        days: meeting.days,
        startMinutes: timeToMinutes(meeting.startTime),
        endMinutes: timeToMinutes(meeting.endTime),
        dateRange: section.dateRange,
      });
    });
  }
  return result;
}
