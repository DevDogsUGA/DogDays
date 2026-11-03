import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSavedPlans } from "./useSavedPlans";

const { from, insert } = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("~/supabase/client", () => ({ supabase: { from } }));
vi.mock("~/components/providers/SessionProvider", () => ({
  useSession: () => ({ user: { id: "user-1" }, isLoading: false }),
}));
vi.mock("~/components/providers/TermProvider", () => ({
  useTerm: () => ({ academicPeriod: 202608 }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  from.mockReturnValue({ insert });
  insert.mockResolvedValue({ error: null });
});

function renderSavedPlans() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useSavedPlans(), {
    wrapper: ({ children }) =>
      createElement(QueryClientProvider, { client }, children),
  });
}

describe("useSavedPlans", () => {
  it("saves an imported plan under its own semester and pin", async () => {
    const { result } = renderSavedPlans();

    await act(async () => {
      await result.current.insertPlans.mutateAsync([
        {
          title: "Imported",
          crns: [101, 202],
          courseIds: [7],
          academicPeriod: 202702,
          pinned: true,
        },
      ]);
    });

    expect(insert).toHaveBeenCalledExactlyOnceWith([
      {
        userId: "user-1",
        academicPeriod: 202702,
        title: "Imported",
        crns: [101, 202],
        courseIds: [7],
        pinned: true,
      },
    ]);
  });

  it("falls back to the navbar semester and unpinned", async () => {
    const { result } = renderSavedPlans();

    await act(async () => {
      await result.current.insertPlans.mutateAsync([
        { title: "Plan 1", crns: [101], courseIds: [7] },
      ]);
    });

    expect(insert).toHaveBeenCalledExactlyOnceWith([
      {
        userId: "user-1",
        academicPeriod: 202608,
        title: "Plan 1",
        crns: [101],
        courseIds: [7],
        pinned: false,
      },
    ]);
  });
});
