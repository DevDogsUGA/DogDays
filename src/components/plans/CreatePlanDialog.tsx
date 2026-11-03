"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  CaretDownIcon,
  CheckIcon,
  CircleNotchIcon,
  MinusIcon,
  SparkleIcon,
} from "@phosphor-icons/react/ssr";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import Combobox from "~/components/ui/Combobox";
import { SectionExclusionList } from "~/components/courses/SectionExclusionList";
import { useSectionsByCourse } from "~/hooks/queries/useSectionsByCourse";
import { useTerm } from "~/components/providers/TermProvider";
import { useDraftPrefs } from "~/hooks/data/useDraftPrefs";
import { useDraftCourses } from "~/hooks/data/useDraftCourses";
import { useSavedPlans } from "~/hooks/data/useSavedPlans";
import { getRecommendedSchedules } from "~/server/actions/generate-schedule";
import { campusOptions, timeOptions } from "~/lib/scheduleFilterOptions";
import { type DraftCourse } from "~/lib/localStorage/types";
import { formatCourseCode } from "~/lib/courseCode";

type CourseSelection = {
  included: boolean;
  tempExcludedCrns: Set<number>;
};

function TriStateCheckbox({
  state,
  onChange,
}: {
  state: "checked" | "indeterminate" | "unchecked";
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "indeterminate";
  }, [state]);

  return (
    <span className="relative inline-flex size-5 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        checked={state !== "unchecked"}
        onChange={onChange}
        className="peer sr-only"
      />
      <span className="border-edge-strong bg-surface peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-primary peer-focus-visible:ring-offset-surface flex size-5 shrink-0 items-center justify-center rounded border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1">
        {state === "checked" && (
          <CheckIcon weight="bold" className="size-3.5 text-white" />
        )}
        {state === "indeterminate" && (
          <MinusIcon weight="bold" className="size-3.5 text-white" />
        )}
      </span>
    </span>
  );
}

function CourseOfferingsSection({
  course,
  academicPeriod,
  included,
  tempExcludedCrns,
  onToggleCourse,
  onToggleSection,
}: {
  course: DraftCourse;
  academicPeriod: number;
  included: boolean;
  tempExcludedCrns: Set<number>;
  onToggleCourse: (allCrns: number[]) => void;
  onToggleSection: (crn: number) => void;
}) {
  const info = course.courses;
  const { data: offerings = [] } = useSectionsByCourse(
    course.courseId,
    academicPeriod,
  );
  const [open, setOpen] = useState(false);

  const hasExclusions =
    included && offerings.length > 0 && tempExcludedCrns.size > 0;
  const allExcluded =
    included &&
    offerings.length > 0 &&
    tempExcludedCrns.size === offerings.length;
  const checkboxState: "checked" | "indeterminate" | "unchecked" =
    !included || allExcluded
      ? "unchecked"
      : hasExclusions
        ? "indeterminate"
        : "checked";

  return (
    <div className="border-edge border-b pb-3 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-3">
        <TriStateCheckbox
          state={checkboxState}
          onChange={() => onToggleCourse(offerings.map((o) => o.crn))}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 cursor-pointer items-center gap-2"
        >
          <span className="flex-1 text-left font-bold">
            {formatCourseCode(info?.abbr, info?.courseNumber)}
            {info?.title ? (
              <span className="font-normal"> — {info.title}</span>
            ) : null}
          </span>
          {offerings.length > 0 && (
            <CaretDownIcon
              weight="bold"
              className={`text-muted size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            />
          )}
        </button>
      </div>

      {open && offerings.length > 0 && (
        <div className="mt-2 pl-8">
          <SectionExclusionList
            offerings={offerings}
            excludedCrns={tempExcludedCrns}
            onToggle={onToggleSection}
          />
        </div>
      )}
    </div>
  );
}

export function CreatePlanDialog({ onClose }: { onClose: () => void }) {
  const { academicPeriod } = useTerm();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, CourseSelection>>(
    {},
  );
  const [minGapMinutes, setMinGapMinutes] = useState<string>();

  const { draftPrefs, setPref, isLoading: prefsLoading } = useDraftPrefs();
  const { draftCourses, isLoading: coursesLoading } = useDraftCourses();
  const { savedPlans, insertPlans } = useSavedPlans();

  const startTime = draftPrefs.prefStartTime ?? "08:00";
  const endTime = draftPrefs.prefEndTime ?? "22:00";
  const campus = draftPrefs.inputCampus ?? "Athens";
  const minCreditHours = draftPrefs.minCreditHours;
  const maxCreditHours = draftPrefs.maxCreditHours;
  const showFilledClasses = draftPrefs.showFilledClasses;

  const startTimeOptions = Object.fromEntries(
    Object.entries(timeOptions).filter(
      ([t]) => !endTime || parseInt(t) < parseInt(endTime),
    ),
  ) as Partial<typeof timeOptions>;

  const endTimeOptions = Object.fromEntries(
    Object.entries(timeOptions).filter(
      ([t]) => !startTime || parseInt(t) > parseInt(startTime),
    ),
  ) as Partial<typeof timeOptions>;

  useEffect(() => {
    // Intentional: seed selection entries for any newly added draft courses,
    // preserving existing selections (returns `prev` unchanged when none added).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelections((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const course of draftCourses) {
        if (!(course.id in next)) {
          next[course.id] = {
            included: true,
            tempExcludedCrns: new Set(course.excludedCrns),
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [draftCourses]);

  function toggleCourse(id: string, allCrns: number[]) {
    setSelections((prev) => {
      const current = prev[id];
      if (!current) return prev;

      const wasIncluded = current.included;
      const hasExclusions = current.tempExcludedCrns.size > 0;
      const allExcluded =
        allCrns.length > 0 && current.tempExcludedCrns.size === allCrns.length;

      if (!wasIncluded || allExcluded) {
        return {
          ...prev,
          [id]: { included: true, tempExcludedCrns: new Set() },
        };
      }

      if (hasExclusions) {
        return {
          ...prev,
          [id]: { included: true, tempExcludedCrns: new Set() },
        };
      }

      return {
        ...prev,
        [id]: { included: false, tempExcludedCrns: new Set() },
      };
    });
  }

  function toggleSection(id: string, crn: number) {
    setSelections((prev) => {
      const current = prev[id];
      if (!current) return prev;
      const tempExcludedCrns = new Set(current.tempExcludedCrns);
      if (tempExcludedCrns.has(crn)) tempExcludedCrns.delete(crn);
      else tempExcludedCrns.add(crn);
      return { ...prev, [id]: { ...current, tempExcludedCrns } };
    });
  }

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const includedCourses = draftCourses.filter(
        (c) => selections[c.id]?.included ?? true,
      );

      if (includedCourses.length === 0) {
        setError("Select at least one course to generate a schedule.");
        return;
      }

      // `abbr` is already the fully-qualified code the server action matches on
      // (`courses.abbr`); appending `courseNumber` would send "CSCI13021302".
      const inputCourseNumbers = includedCourses
        .map((c) => c.courses?.abbr)
        .filter((abbr): abbr is string => !!abbr);

      if (inputCourseNumbers.length === 0) {
        setError("Could not read the course codes for your selection.");
        return;
      }
      const excludedSectionCrns = includedCourses.flatMap((c) => [
        ...(selections[c.id]?.tempExcludedCrns ?? []),
      ]);

      const result = await getRecommendedSchedules({
        academicPeriod: academicPeriod!,
        inputCourseNumbers,
        excludedSectionCrns,
        prefStartTime: startTime,
        prefEndTime: endTime,
        inputCampus: campus,
        minCreditHours,
        maxCreditHours,
        showFilledClasses,
        ...(minGapMinutes && { minGapMinutes: parseInt(minGapMinutes) }),
      });

      // An empty CRN list is not a plan. Saving one produces a plan whose
      // detail view can never load.
      const schedules = result.data.filter((crns) => crns.length > 0);

      if (result.error !== undefined || schedules.length === 0) {
        setError(
          result.error ??
            "No schedules found matching your criteria — try adjusting your filters or included courses/sections.",
        );
        return;
      }

      const baseCount = savedPlans.length;

      try {
        await insertPlans.mutateAsync(
          schedules.map((crns, i) => ({
            title: `Plan ${baseCount + i + 1}`,
            crns,
            courseIds: includedCourses.map((c) => c.courseId),
          })),
        );
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save plans.");
      }
    });
  }

  const bodyLoading = prefsLoading || coursesLoading;

  return (
    <Dialog
      title="Create New Plan"
      onClose={onClose}
      className="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isPending || bodyLoading}
            className="group relative"
          >
            <span className="flex items-center gap-2 transition-opacity group-disabled:opacity-0">
              <SparkleIcon weight="bold" />
              Generate
            </span>
            <CircleNotchIcon
              weight="bold"
              className="absolute top-1/2 left-1/2 -translate-1/2 animate-spin opacity-0 transition-opacity [animation-duration:500ms] group-disabled:opacity-100"
            />
          </Button>
        </>
      }
    >
      <fieldset
        disabled={isPending}
        className="flex flex-col gap-8 overflow-y-auto px-6 py-4"
      >
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-bold">Your Courses</h3>
          {bodyLoading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="bg-surface-muted h-8 w-full animate-pulse rounded"
                />
              ))}
            </div>
          ) : draftCourses.length === 0 ? (
            <p className="text-muted text-sm">
              You haven&apos;t saved any courses yet. Add some on the{" "}
              <Link href="/courses" className="text-accent underline">
                Courses
              </Link>{" "}
              page.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {draftCourses.map((course) => (
                <CourseOfferingsSection
                  key={course.id}
                  course={course}
                  academicPeriod={academicPeriod!}
                  included={selections[course.id]?.included ?? true}
                  tempExcludedCrns={
                    selections[course.id]?.tempExcludedCrns ?? new Set()
                  }
                  onToggleCourse={(allCrns) => toggleCourse(course.id, allCrns)}
                  onToggleSection={(crn) => toggleSection(course.id, crn)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h3 className="text-base font-bold">Filters</h3>
          {bodyLoading ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-surface-muted h-9 w-full animate-pulse rounded"
                />
              ))}
            </div>
          ) : (
            <fieldset className="grid grid-cols-[1fr_2fr] gap-x-3 gap-y-4 text-right text-sm sm:grid-cols-[repeat(2,1fr_2fr)] sm:gap-y-6">
              <label className="col-span-2 grid grid-cols-subgrid items-center">
                <span className="pl-3 text-right font-bold">Start Time</span>
                <Combobox
                  value={startTime as keyof typeof timeOptions}
                  onChange={(v) => v && setPref("prefStartTime", v)}
                  options={startTimeOptions}
                  preserveOrdering
                  required
                  searchPlaceholder="Search Start Times"
                  displayText={(s) =>
                    s ? startTimeOptions[s] : "Select a Start Time"
                  }
                />
              </label>

              <label className="col-span-2 grid grid-cols-subgrid items-center">
                <span className="pl-3 text-right font-bold">End Time</span>
                <Combobox
                  value={endTime as keyof typeof timeOptions}
                  onChange={(v) => v && setPref("prefEndTime", v)}
                  options={endTimeOptions}
                  preserveOrdering
                  required
                  searchPlaceholder="Search End Times"
                  displayText={(s) =>
                    s ? endTimeOptions[s] : "Select an End Time"
                  }
                />
              </label>

              <label className="col-span-2 grid grid-cols-subgrid items-center">
                <span className="pl-3 text-right font-bold">
                  Min Time Between Classes
                </span>
                <input
                  className="border-edge-strong bg-surface not-disabled:hover:border-muted flex w-full items-center gap-6 rounded-md border-2 px-3 py-1.5 transition-[box-shadow,border-color] not-disabled:hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  min={0}
                  onChange={(e) => setMinGapMinutes(e.currentTarget.value)}
                  type="number"
                />
              </label>

              <label className="col-span-2 grid grid-cols-subgrid items-center">
                <span className="pl-3 text-right font-bold">Campus</span>
                <Combobox
                  value={campus as keyof typeof campusOptions}
                  options={campusOptions}
                  required
                  searchPlaceholder="Search Campuses"
                  displayText={(s) =>
                    s ? campusOptions[s] : "Select a Campus"
                  }
                  onChange={(v) => v && setPref("inputCampus", v)}
                />
              </label>

              <label className="border-edge text-foreground/80 not-disabled:hover:text-foreground col-span-3 flex items-center justify-center gap-4 border-b-2 pb-4 has-disabled:cursor-not-allowed has-disabled:opacity-60 sm:pb-6">
                <input
                  className="form-checkbox border-edge-strong bg-surface text-primary not-disabled:hover:border-muted focus:ring-primary size-6 rounded-md border-2"
                  type="checkbox"
                  checked={showFilledClasses}
                  onChange={(e) =>
                    setPref("showFilledClasses", e.currentTarget.checked)
                  }
                />
                <span className="text-left leading-tight text-balance">
                  Include Waitlisted Course Sections
                </span>
              </label>

              <label className="col-span-2 grid grid-cols-subgrid items-center">
                <span className="pl-3 text-right font-bold">
                  Min Credit Hours
                </span>
                <input
                  className="border-edge-strong bg-surface not-disabled:hover:border-muted flex w-full items-center gap-6 rounded-md border-2 px-3 py-1.5 transition-[box-shadow,border-color] not-disabled:hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  min={0}
                  max={maxCreditHours}
                  onChange={(e) =>
                    setPref("minCreditHours", parseInt(e.currentTarget.value))
                  }
                  required
                  type="number"
                  value={minCreditHours}
                />
              </label>

              <label className="col-span-2 grid grid-cols-subgrid items-center">
                <span className="pl-3 text-right font-bold">
                  Max Credit Hours
                </span>
                <input
                  className="border-edge-strong bg-surface not-disabled:hover:border-muted flex w-full items-center gap-6 rounded-md border-2 px-3 py-1.5 transition-[box-shadow,border-color] not-disabled:hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  min={minCreditHours}
                  max={18}
                  onChange={(e) =>
                    setPref("maxCreditHours", parseInt(e.currentTarget.value))
                  }
                  required
                  type="number"
                  value={maxCreditHours}
                />
              </label>
            </fieldset>
          )}
        </section>

        {error && <p className="text-accent text-sm font-medium">{error}</p>}
      </fieldset>
    </Dialog>
  );
}
