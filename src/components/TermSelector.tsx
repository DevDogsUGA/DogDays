"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTerm } from "~/components/providers/TermProvider";
import { useTerms } from "~/hooks/queries/useTerms";
import { useSession } from "~/components/providers/SessionProvider";
import { supabase } from "~/supabase/client";
import { LOCAL_KEYS } from "~/lib/localStorage/keys";
import {
  LocalDraftCoursesMap,
  LocalSavedPlans,
} from "~/lib/localStorage/schemas";
import { readLocal } from "~/lib/localStorage/storage";
import * as Select from "@radix-ui/react-select";
import { CaretUpDownIcon } from "@phosphor-icons/react/ssr";

function useTermCounts() {
  const { user, isLoading: sessionLoading } = useSession();

  const { data: courseCounts = {} } = useQuery<Record<number, number>>({
    queryKey: ["term-course-counts", user?.id],
    enabled: !sessionLoading,
    queryFn: async () => {
      const counts: Record<number, number> = {};
      if (user) {
        const { data, error } = await supabase
          .from("userPlanDraftCourses")
          .select("academicPeriod");
        if (error) throw error;
        for (const row of data ?? []) {
          counts[row.academicPeriod] = (counts[row.academicPeriod] ?? 0) + 1;
        }
      } else {
        const map = readLocal(LOCAL_KEYS.draftCourses, LocalDraftCoursesMap);
        for (const [period, courses] of Object.entries(map)) {
          if (courses.length > 0) counts[Number(period)] = courses.length;
        }
      }
      return counts;
    },
  });

  const { data: planCounts = {} } = useQuery<Record<number, number>>({
    queryKey: ["term-plan-counts", user?.id],
    enabled: !sessionLoading,
    queryFn: async () => {
      const counts: Record<number, number> = {};
      if (user) {
        const { data, error } = await supabase
          .from("userSavedPlans")
          .select("academicPeriod");
        if (error) throw error;
        for (const row of data ?? []) {
          counts[row.academicPeriod] = (counts[row.academicPeriod] ?? 0) + 1;
        }
      } else {
        const all = readLocal(LOCAL_KEYS.savedPlans, LocalSavedPlans);
        for (const plan of all) {
          counts[plan.academicPeriod] = (counts[plan.academicPeriod] ?? 0) + 1;
        }
      }
      return counts;
    },
  });

  return { courseCounts, planCounts };
}

export function TermSelector() {
  const { academicPeriod, setAcademicPeriod, availableTerms } = useTerm();
  const { courseCounts, planCounts } = useTermCounts();

  const { data: terms = [] } = useTerms();

  const { openTerms, closedTerms } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    // Registration is open while any part of the term still has a drop/add
    // day ahead of it.
    const openPeriods = new Set(
      terms
        .filter((term) => term.dropAddEnds.some((end) => end >= today))
        .map((term) => term.academicPeriod),
    );

    const sorted = [...availableTerms].sort(
      (a, b) => b.academicPeriod - a.academicPeriod,
    );

    return {
      openTerms: sorted.filter((t) => openPeriods.has(t.academicPeriod)),
      closedTerms: sorted.filter((t) => !openPeriods.has(t.academicPeriod)),
    };
  }, [availableTerms, terms]);

  if (availableTerms.length === 0) return null;

  function renderItem(term: { academicPeriod: number; description: string }) {
    const courses = courseCounts[term.academicPeriod] ?? 0;
    const plans = planCounts[term.academicPeriod] ?? 0;

    return (
      <Select.Item
        key={term.academicPeriod}
        value={String(term.academicPeriod)}
        className="hover:bg-surface-muted flex w-full items-center justify-between gap-3 py-1.5 pr-3 pl-3 transition-colors"
      >
        <span className="truncate">{term.description}</span>
        {(courses > 0 || plans > 0) && (
          <span className="text-muted shrink-0 text-xs">
            {courses > 0 && `${courses} course${courses !== 1 ? "s" : ""}`}
            {courses > 0 && plans > 0 && ", "}
            {plans > 0 && `${plans} plan${plans !== 1 ? "s" : ""}`}
          </span>
        )}
      </Select.Item>
    );
  }

  return (
    <Select.Root
      value={String(academicPeriod)}
      onValueChange={(v) => setAcademicPeriod(Number(v))}
    >
      <Select.Trigger
        aria-label="Term"
        className="group border-edge-strong bg-surface-muted text-foreground/80 hover:border-muted flex max-w-2xs flex-1 items-center gap-3 rounded-full border px-3 py-1.5 text-sm font-medium transition-[box-shadow,border-color,color] hover:inset-shadow-sm"
      >
        <span className="w-full flex-1 truncate text-left">
          <Select.Value>
            {
              availableTerms.find(
                (term) => term.academicPeriod === academicPeriod,
              )?.description
            }
          </Select.Value>
        </span>
        <CaretUpDownIcon
          aria-hidden
          weight="bold"
          className="text-muted group-hover:text-foreground transition-colors"
        />
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className="border-edge-strong bg-surface z-50 flex max-w-xs min-w-52 flex-col rounded-xl border py-1.5 text-sm shadow-xl"
          position="popper"
          sideOffset={3}
        >
          {openTerms.length > 0 && (
            <Select.Group>
              <Select.Label className="text-muted px-3 pt-1 pb-0.5 text-xs font-semibold tracking-wide uppercase">
                Open for Registration
              </Select.Label>
              {openTerms.map(renderItem)}
            </Select.Group>
          )}

          {openTerms.length > 0 && closedTerms.length > 0 && (
            <Select.Separator className="bg-edge mx-2 my-1.5 h-px" />
          )}

          {closedTerms.length > 0 && (
            <Select.Group>
              <Select.Label className="text-muted px-3 pt-1 pb-0.5 text-xs font-semibold tracking-wide uppercase">
                Registration Closed
              </Select.Label>
              {closedTerms.map(renderItem)}
            </Select.Group>
          )}
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
