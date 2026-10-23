import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, deleteUser } = vi.hoisted(() => ({
  rpc: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ rpc, auth: { admin: { deleteUser } } })),
}));
vi.mock("~/env", () => ({
  env: { NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" },
}));

const { supabaseReceiverDeps } = await import("./supabase");
const USER = "00000000-0000-4000-8000-0000000000a1";

beforeEach(() => vi.clearAllMocks());

describe("supabaseReceiverDeps", () => {
  it("calls the function with the id and the parsed message", async () => {
    rpc.mockResolvedValue({
      data: { outcome: "applied", userId: USER },
      error: null,
    });
    const result = await supabaseReceiverDeps("key").apply("msg_1", '{"a":1}');
    expect(rpc).toHaveBeenCalledWith("apply_moderation_event", {
      p_id: "msg_1",
      p_message: { a: 1 },
    });
    expect(result).toEqual({ outcome: "applied", userId: USER });
  });

  it("throws a database error so the route answers 5xx", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(supabaseReceiverDeps("key").apply("m", "{}")).rejects.toThrow(
      "boom",
    );
  });

  it("treats an already-deleted user as success", async () => {
    deleteUser.mockResolvedValue({
      error: { status: 404, code: "user_not_found" },
    });
    await expect(
      supabaseReceiverDeps("key").deleteUser(USER),
    ).resolves.toBeUndefined();
  });

  it("throws any other admin API error", async () => {
    deleteUser.mockResolvedValue({ error: { status: 500, code: "unexpected" } });
    await expect(supabaseReceiverDeps("key").deleteUser(USER)).rejects.toEqual({
      status: 500,
      code: "unexpected",
    });
  });
});
