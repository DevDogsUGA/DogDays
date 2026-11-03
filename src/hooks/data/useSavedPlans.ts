"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "~/supabase/client";
import { useSession } from "~/components/providers/SessionProvider";
import { useTerm } from "~/components/providers/TermProvider";
import { LOCAL_KEYS } from "~/lib/localStorage/keys";
import { LocalSavedPlans } from "~/lib/localStorage/schemas";
import { readLocal, writeLocal } from "~/lib/localStorage/storage";
import { type SavedPlan } from "~/lib/localStorage/types";

export function useSavedPlans() {
  const { user, isLoading: sessionLoading } = useSession();
  // Read the effective term from TermProvider, not the raw preference:
  // a first-time visitor has no saved preference, and the provider's
  // fallback to the latest term is what the UI actually displays.
  const { academicPeriod } = useTerm();
  const queryClient = useQueryClient();

  const { data: savedPlans = [], isLoading } = useQuery<SavedPlan[]>({
    queryKey: ["plans", academicPeriod],
    enabled: academicPeriod != null && !sessionLoading,
    queryFn: async () => {
      if (user) {
        const { data, error } = await supabase
          .from("userSavedPlans")
          .select("*")
          .eq("userId", user.id)
          .eq("academicPeriod", academicPeriod!)
          .order("pinned", { ascending: false });
        if (error) throw error;
        return data ?? [];
      }
      const all = readLocal(LOCAL_KEYS.savedPlans, LocalSavedPlans);
      return all
        .filter((p) => p.academicPeriod === academicPeriod)
        .sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1));
    },
  });

  const insertPlans = useMutation({
    mutationFn: async (
      plans: {
        title: string;
        crns: number[];
        courseIds: number[];
        academicPeriod?: number;
        pinned?: boolean;
      }[],
    ) => {
      if (user) {
        const { error } = await supabase.from("userSavedPlans").insert(
          plans.map((p) => ({
            userId: user.id,
            academicPeriod: p.academicPeriod ?? academicPeriod!,
            title: p.title,
            crns: p.crns,
            courseIds: p.courseIds,
            pinned: p.pinned ?? false,
          })),
        );
        if (error) throw error;
      } else {
        const existing = readLocal(LOCAL_KEYS.savedPlans, LocalSavedPlans);
        const now = new Date().toISOString();
        const newPlans: SavedPlan[] = plans.map((p) => ({
          id: crypto.randomUUID(),
          academicPeriod: academicPeriod!,
          title: p.title,
          crns: p.crns,
          courseIds: p.courseIds,
          pinned: false,
          createdAt: now,
          updatedAt: now,
        }));
        writeLocal(LOCAL_KEYS.savedPlans, LocalSavedPlans, [
          ...existing,
          ...newPlans,
        ]);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["plans", academicPeriod],
      });
      void queryClient.invalidateQueries({ queryKey: ["term-plan-counts"] });
    },
  });

  const updatePlan = useMutation({
    mutationFn: async (patch: {
      id: string;
      pinned?: boolean;
      title?: string;
    }) => {
      if (user) {
        const { error } = await supabase
          .from("userSavedPlans")
          .update({
            ...(patch.pinned !== undefined && { pinned: patch.pinned }),
            ...(patch.title !== undefined && { title: patch.title }),
            updatedAt: new Date().toISOString(),
          })
          .eq("id", patch.id)
          .eq("userId", user.id);
        if (error) throw error;
      } else {
        const all = readLocal(LOCAL_KEYS.savedPlans, LocalSavedPlans);
        writeLocal(
          LOCAL_KEYS.savedPlans,
          LocalSavedPlans,
          all.map((p) =>
            p.id === patch.id
              ? {
                  ...p,
                  ...(patch.pinned !== undefined && { pinned: patch.pinned }),
                  ...(patch.title !== undefined && { title: patch.title }),
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
        );
      }
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["plans", academicPeriod] });
      const prev = queryClient.getQueryData<SavedPlan[]>([
        "plans",
        academicPeriod,
      ]);
      queryClient.setQueryData<SavedPlan[]>(["plans", academicPeriod], (old) =>
        (old ?? []).map((p) => (p.id === patch.id ? { ...p, ...patch } : p)),
      );
      return { prev };
    },
    onError: (_err, _patch, ctx) =>
      queryClient.setQueryData(["plans", academicPeriod], ctx?.prev),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["plans", academicPeriod] }),
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      if (user) {
        const { error } = await supabase
          .from("userSavedPlans")
          .delete()
          .eq("id", id)
          .eq("userId", user.id);
        if (error) throw error;
      } else {
        const all = readLocal(LOCAL_KEYS.savedPlans, LocalSavedPlans);
        writeLocal(
          LOCAL_KEYS.savedPlans,
          LocalSavedPlans,
          all.filter((p) => p.id !== id),
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["plans", academicPeriod],
      });
      void queryClient.invalidateQueries({ queryKey: ["term-plan-counts"] });
    },
  });

  return {
    savedPlans,
    insertPlans,
    updatePlan,
    deletePlan,
    isLoading: sessionLoading || isLoading,
  };
}

export function useSavedPlan(id: string) {
  const result = useSavedPlans();
  const plan = result.savedPlans.find((p) => p.id === id);
  return { ...result, plan };
}
