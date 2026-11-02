import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { WeekSchedule as WeekScheduleType } from "~/types/scheduleTypes";
import WeekSchedule from "./WeekSchedule";

afterEach(() => cleanup());

const FIVE_DAY_WEEK: WeekScheduleType = {
  Monday: [],
  Tuesday: [],
  Wednesday: [],
  Thursday: [],
  Friday: [],
};

const SEVEN_DAY_WEEK: WeekScheduleType = {
  ...FIVE_DAY_WEEK,
  Saturday: [],
  Sunday: [],
};

describe("WeekSchedule", () => {
  it("renders one day-column per key present in weekData, including weekends", () => {
    render(<WeekSchedule weekData={SEVEN_DAY_WEEK} />);

    expect(document.querySelectorAll("[data-title]")).toHaveLength(7);
    for (const day of Object.keys(SEVEN_DAY_WEEK)) {
      expect(
        document.querySelector(`[data-title="${day}"]`),
      ).toBeInTheDocument();
    }
  });

  it("sizes the grid template from the day count via --day-count", () => {
    // The template's day tracks come from the inline custom property, not a
    // per-count class-string lookup, so the count must follow the data.
    const { container: five } = render(
      <WeekSchedule weekData={FIVE_DAY_WEEK} />,
    );
    expect(
      five.querySelector("section")!.style.getPropertyValue("--day-count"),
    ).toBe("5");
    cleanup();

    const { container: seven } = render(
      <WeekSchedule weekData={SEVEN_DAY_WEEK} />,
    );
    expect(
      seven.querySelector("section")!.style.getPropertyValue("--day-count"),
    ).toBe("7");
  });

  it("switches the phone-visible column through the day tabs", () => {
    render(<WeekSchedule weekData={SEVEN_DAY_WEEK} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(7);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    // Only the selected day's column is in the phone layout ("flex"); the
    // rest are `hidden md:flex`.
    const columnFor = (day: string) =>
      document.querySelector(`[data-title="${day}"]`)!;
    expect(columnFor("Monday").className).not.toContain("hidden");
    expect(columnFor("Saturday").className).toContain("hidden");

    fireEvent.click(screen.getByRole("tab", { name: "Saturday" }));

    expect(screen.getByRole("tab", { name: "Saturday" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Monday" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(columnFor("Saturday").className).not.toContain("hidden");
    expect(columnFor("Monday").className).toContain("hidden");
  });

  it("keeps every day-column in the print layout even when a phone tab is selected", () => {
    render(<WeekSchedule weekData={SEVEN_DAY_WEEK} />);

    expect(screen.getByRole("tablist").className).toContain("print:hidden");

    fireEvent.click(screen.getByRole("tab", { name: "Wednesday" }));

    for (const day of Object.keys(SEVEN_DAY_WEEK)) {
      expect(
        document.querySelector(`[data-title="${day}"]`)!.className,
      ).toContain("print:flex");
    }
    // Screen selection is unchanged: Wednesday is the phone column, Monday is not.
    expect(
      document.querySelector(`[data-title="Wednesday"]`)!.className,
    ).not.toContain("hidden");
    expect(
      document.querySelector(`[data-title="Monday"]`)!.className,
    ).toContain("hidden");
  });
});
