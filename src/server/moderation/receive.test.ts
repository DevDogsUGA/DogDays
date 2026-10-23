import { signMessage, generateSecret } from "@devdogsuga/sdk/moderation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { receiveModeration, type ReceiverDeps } from "./receive";

const secret = generateSecret();
const PLATFORM_USER = "aaaaaaaa-0000-4000-8000-000000000001";
const LOCAL_USER = "00000000-0000-4000-8000-0000000000a1";

const deleteMessage = JSON.stringify({
  type: "user.delete",
  timestamp: "2027-01-02T10:00:00.000Z",
  data: { userId: PLATFORM_USER, reason: null, reportId: null },
});
const banMessage = JSON.stringify({
  type: "user.ban",
  timestamp: "2027-01-02T10:00:00.000Z",
  data: { userId: PLATFORM_USER, reason: "spam", reportId: null },
});
const hideMessage = JSON.stringify({
  type: "content.hide",
  timestamp: "2027-01-02T10:00:00.000Z",
  data: { contentType: "plan", contentRef: "abc", reportId: null },
});

async function delivery(
  body: string,
  options: { id?: string; timestamp?: number; secret?: string } = {},
) {
  const headers = await signMessage(options.secret ?? secret, body, {
    id: options.id ?? "msg_1",
    timestamp: options.timestamp,
  });
  return new Request("https://dogdays.dev/platform-moderation", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body,
  });
}

let deps: ReceiverDeps;
let apply: ReturnType<typeof vi.fn>;
let deleteUser: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  apply = vi.fn().mockResolvedValue({ outcome: "applied", userId: LOCAL_USER });
  deleteUser = vi.fn().mockResolvedValue(undefined);
  deps = { secrets: [secret], apply, deleteUser };
});

describe("signature", () => {
  it("accepts a valid signature", async () => {
    const response = await receiveModeration(await delivery(banMessage), deps);
    expect(response.status).toBe(200);
    expect(apply).toHaveBeenCalledWith("msg_1", banMessage);
  });

  it("rejects a signature made with another secret", async () => {
    const response = await receiveModeration(
      await delivery(banMessage, { secret: generateSecret() }),
      deps,
    );
    expect(response.status).toBe(401);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects a body changed after signing", async () => {
    const signed = await delivery(banMessage);
    const tampered = new Request(signed.url, {
      method: "POST",
      headers: signed.headers,
      body: banMessage.replace("spam", "kind"),
    });
    expect((await receiveModeration(tampered, deps)).status).toBe(401);
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects unsigned requests", async () => {
    const request = new Request("https://dogdays.dev/platform-moderation", {
      method: "POST",
      body: banMessage,
    });
    expect((await receiveModeration(request, deps)).status).toBe(401);
  });

  it("rejects a stale delivery (older than five minutes)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const response = await receiveModeration(
      await delivery(banMessage, { timestamp: now - 600 }),
      deps,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "expired" });
    expect(apply).not.toHaveBeenCalled();
  });

  it("accepts either secret while one is being rotated", async () => {
    const next = generateSecret();
    const response = await receiveModeration(
      await delivery(banMessage, { secret: next }),
      { ...deps, secrets: [secret, next] },
    );
    expect(response.status).toBe(200);
  });

  it("answers 503 when no secret is configured", async () => {
    const response = await receiveModeration(await delivery(banMessage), {
      ...deps,
      secrets: [],
    });
    expect(response.status).toBe(503);
  });

  it("answers 405 to anything but POST", async () => {
    const response = await receiveModeration(
      new Request("https://dogdays.dev/platform-moderation"),
      deps,
    );
    expect(response.status).toBe(405);
  });
});

describe("idempotency", () => {
  it("passes the webhook id through and reports a duplicate as 200", async () => {
    apply.mockResolvedValueOnce({ outcome: "duplicate", userId: LOCAL_USER });
    const response = await receiveModeration(
      await delivery(banMessage, { id: "msg_seen" }),
      deps,
    );
    expect(apply).toHaveBeenCalledWith("msg_seen", banMessage);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ outcome: "duplicate" });
  });

  it("acknowledges a stale message without deleting for a ban", async () => {
    apply.mockResolvedValueOnce({ outcome: "stale", userId: LOCAL_USER });
    const response = await receiveModeration(await delivery(banMessage), deps);
    expect(response.status).toBe(200);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("answers 5xx when the database fails, so the platform retries", async () => {
    apply.mockRejectedValueOnce(new Error("db down"));
    const response = await receiveModeration(await delivery(banMessage), deps);
    expect(response.status).toBe(500);
  });

  it("answers 2xx to a signed message it does not understand", async () => {
    const body = JSON.stringify({ type: "user.teleport", data: {} });
    const response = await receiveModeration(await delivery(body), deps);
    expect(response.status).toBe(200);
    expect(apply).not.toHaveBeenCalled();
  });

  it("records a content message and deletes no one", async () => {
    apply.mockResolvedValueOnce({ outcome: "applied", userId: null });
    const response = await receiveModeration(await delivery(hideMessage), deps);
    expect(response.status).toBe(200);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

describe("user.delete", () => {
  it("deletes the linked DogDays user", async () => {
    const response = await receiveModeration(
      await delivery(deleteMessage),
      deps,
    );
    expect(response.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledExactlyOnceWith(LOCAL_USER);
  });

  it("answers 2xx for a user DogDays has no account for", async () => {
    apply.mockResolvedValueOnce({ outcome: "applied", userId: null });
    const response = await receiveModeration(
      await delivery(deleteMessage),
      deps,
    );
    expect(response.status).toBe(200);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("answers 2xx for a repeat once the account is gone", async () => {
    apply.mockResolvedValueOnce({ outcome: "duplicate", userId: null });
    const response = await receiveModeration(
      await delivery(deleteMessage),
      deps,
    );
    expect(response.status).toBe(200);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("finishes the delete when a repeat finds the user still there", async () => {
    apply.mockResolvedValueOnce({ outcome: "duplicate", userId: LOCAL_USER });
    await receiveModeration(await delivery(deleteMessage), deps);
    expect(deleteUser).toHaveBeenCalledWith(LOCAL_USER);
  });

  it("deletes even when the ordering says stale (deletion is final)", async () => {
    apply.mockResolvedValueOnce({ outcome: "stale", userId: LOCAL_USER });
    await receiveModeration(await delivery(deleteMessage), deps);
    expect(deleteUser).toHaveBeenCalledWith(LOCAL_USER);
  });

  it("answers 5xx when the admin delete fails, so the platform retries", async () => {
    deleteUser.mockRejectedValueOnce(new Error("auth down"));
    const response = await receiveModeration(
      await delivery(deleteMessage),
      deps,
    );
    expect(response.status).toBe(500);
  });
});
