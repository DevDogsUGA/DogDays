import { formatCourseCode } from "../courseCode";
import type { BuildingLocation, DayOfWeek, Section } from "../domain/section";

export interface MapMeeting {
  sectionCrn: number;
  meetingIndex: number;
  courseCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  building: BuildingLocation | null;
  room: string | null;
}

export type DayMeetings = Record<DayOfWeek, MapMeeting[]>;

export function groupMeetingsByDay(sections: readonly Section[]): DayMeetings {
  const result: DayMeetings = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };

  for (const section of sections) {
    for (const [index, meeting] of section.meetings.entries()) {
      for (const day of meeting.days) {
        result[day].push({
          sectionCrn: section.crn,
          meetingIndex: index,
          courseCode: formatCourseCode(
            section.courseAbbr,
            section.courseNumber,
          ),
          title: section.courseTitle,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          building: meeting.building,
          room: meeting.room,
        });
      }
    }
  }
  return result;
}
