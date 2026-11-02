import type { DateRange, DayOfWeek, Meeting, Section } from "../domain/section";

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** True when two "HH:MM" time-of-day ranges overlap. Back-to-back (one's end
 * equals the other's start) does NOT count as overlapping. */
function timeRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return (
    timeToMinutes(aStart) < timeToMinutes(bEnd) &&
    timeToMinutes(bStart) < timeToMinutes(aEnd)
  );
}

/** True when two date ranges (inclusive, "YYYY-MM-DD"-ish ISO strings that
 * sort lexically) overlap at all. */
function dateRangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start <= b.end && b.start <= a.end;
}

function daysOverlap(a: DayOfWeek[], b: DayOfWeek[]): boolean {
  return a.some((day) => b.includes(day));
}

/**
 * True when a single meeting (paired with the date range of the section it
 * belongs to) conflicts with another.
 *
 * Two meetings conflict iff they share a weekday AND their time-of-day
 * ranges overlap AND their sections' date ranges overlap. All three terms
 * matter: a pair that overlaps in weekday and time but whose terms are
 * disjoint (e.g. a Maymester section vs. a second-summer-session section)
 * does NOT conflict — that date-range term is the fix for the summer
 * scheduling bug, where a weekday+time-only comparison flagged sections
 * that could never actually collide because they never run at the same
 * time of year.
 *
 * Null handling (documented choices, not enforced elsewhere):
 * - A meeting with a `null` `startTime` or `endTime` (an async/TBA meeting
 *   with no fixed slot) occupies no time-of-day slot, so it can never
 *   conflict with anything.
 * - A `null` date range is a should-be-impossible data anomaly (see the
 *   doc comment on `Section.dateRange`) — a failed join, not a real
 *   "no term" case. We fail safe: an unknown date range is treated as
 *   overlapping everything, so a broken join can never silently hide a
 *   real conflict. (The alternative — treating unknown as "never
 *   overlaps" — would let bad data sneak a double-booking past the
 *   engine.)
 */
export function meetingsConflict(
  a: { meeting: Meeting; dateRange: DateRange | null },
  b: { meeting: Meeting; dateRange: DateRange | null },
): boolean {
  const { meeting: am, dateRange: ar } = a;
  const { meeting: bm, dateRange: br } = b;

  if (am.startTime == null || am.endTime == null) return false;
  if (bm.startTime == null || bm.endTime == null) return false;

  if (!daysOverlap(am.days, bm.days)) return false;
  if (!timeRangesOverlap(am.startTime, am.endTime, bm.startTime, bm.endTime))
    return false;

  // Should-be-impossible anomaly: fail safe rather than assume disjoint.
  if (ar == null || br == null) return true;

  return dateRangesOverlap(ar, br);
}

/**
 * Pairwise helper: true when any meeting of `a` conflicts with any meeting
 * of `b`, using each section's own `dateRange`. A schedule never contains
 * two sections of the same course, so this only ever needs to compare
 * sections against each other — never a section against itself.
 */
export function sectionsConflict(a: Section, b: Section): boolean {
  for (const am of a.meetings) {
    for (const bm of b.meetings) {
      if (
        meetingsConflict(
          { meeting: am, dateRange: a.dateRange },
          { meeting: bm, dateRange: b.dateRange },
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * The always-on, non-optional invariant: true when no two sections in the
 * (possibly partial) schedule conflict with each other. The engine calls
 * this directly on every partial it builds — it is not a `ScheduleRule` and
 * is never registered, because no feature could ever want to disable it.
 */
export function noConflicts(sections: Section[]): boolean {
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      if (sectionsConflict(sections[i]!, sections[j]!)) return false;
    }
  }
  return true;
}
