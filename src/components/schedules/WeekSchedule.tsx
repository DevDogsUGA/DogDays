"use client";

import { type CSSProperties, useState } from "react";
import { SCHEDULE_END_HOUR, SCHEDULE_START_HOUR } from "~/lib/schedule-display";
import { type WeekSchedule as WeekScheduleType } from "~/types/scheduleTypes";
import DayClass from "./DayClass";

interface WeekScheduleProps {
  weekData: WeekScheduleType;
}

const TOTAL_HOURS = SCHEDULE_END_HOUR - SCHEDULE_START_HOUR + 1;

const HOURS = Array.from(
  { length: TOTAL_HOURS },
  (_, i) => SCHEDULE_START_HOUR + i,
);

/** Percentage offset of an hour from the top of the day column. */
function hourTop(hour: number): string {
  return `${((hour - SCHEDULE_START_HOUR) * 100) / TOTAL_HOURS}%`;
}

function hourLabel(hour: number): string {
  const ampm = hour > 12 ? hour - 12 : hour;
  const period = hour >= 12 ? "PM" : "AM";
  return `${ampm} ${period}`;
}

/**
 * The week grid. On `md` and up every day gets a column; below that a tab
 * strip selects a single day, rendered full-width — a state change rather
 * than the horizontal scroll-snap the layout previously simulated, since
 * seven columns can't be read on a phone anyway.
 */
export default function WeekSchedule({ weekData }: WeekScheduleProps) {
  const days = Object.keys(weekData);
  const [selectedDay, setSelectedDay] = useState(days[0]);
  // The selection survives a weekData swap only if the day still exists.
  const activeDay =
    selectedDay && days.includes(selectedDay) ? selectedDay : days[0];

  return (
    <div className="flex w-full flex-col gap-3 p-3 sm:p-4">
      <div
        role="tablist"
        className="flex gap-1.5 overflow-x-auto md:hidden print:hidden"
      >
        {days.map((day) => (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={day === activeDay}
            onClick={() => setSelectedDay(day)}
            className="border-edge aria-selected:border-primary aria-selected:bg-primary not-aria-selected:hover:bg-surface-muted rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors aria-selected:text-white"
          >
            {day}
          </button>
        ))}
      </div>

      <section
        className="week-grid grid w-full gap-x-2 [--hour-height:2.75rem] md:[--hour-height:3.25rem]"
        style={{ "--day-count": days.length } as CSSProperties}
      >
        {/* Time axis */}
        <div className="flex flex-col">
          <div className="h-9 shrink-0" />
          <div className="relative flex-1">
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="text-muted absolute right-1 -translate-y-1/2 text-xs whitespace-nowrap"
                style={{ top: hourTop(hour) }}
              >
                {hourLabel(hour)}
              </span>
            ))}
          </div>
        </div>

        {days.map((day) => (
          <div
            key={day}
            data-title={day}
            className={`${day === activeDay ? "flex" : "hidden md:flex"} min-w-0 flex-col print:flex`}
          >
            <h2 className="bg-navy text-navy-foreground flex h-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold">
              {day}
            </h2>
            <div
              className="relative"
              style={{ height: `calc(var(--hour-height) * ${TOTAL_HOURS})` }}
            >
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  aria-hidden
                  className="border-edge absolute right-0 left-0 border-t"
                  style={{ top: hourTop(hour) }}
                />
              ))}
              {weekData[day]?.map((classData, index) => (
                // Colours and grid offset are computed in toWeekSchedule, so
                // the display stays a pure function of its props.
                <DayClass
                  key={`${day}-${classData.classTitle}-${index}`}
                  {...classData}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
