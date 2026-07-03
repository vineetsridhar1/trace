import { describe, expect, it } from "vitest";
import { pollDeviceLogin } from "./device-flow.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function successResponse(token: string): Response {
  return new Response(JSON.stringify({ status: "success" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `trace_token=${token}; Path=/; HttpOnly`,
    },
  });
}

function pollHarness(responses: Response[]) {
  const sleeps: number[] = [];
  let call = 0;
  const fetchImpl = (() => {
    const response = responses[call];
    call += 1;
    if (!response) throw new Error("poll fetch called more times than expected");
    return Promise.resolve(response);
  }) as typeof fetch;
  const sleep = (ms: number): Promise<void> => {
    sleeps.push(ms);
    return Promise.resolve();
  };
  return { fetchImpl, sleep, sleeps };
}

const baseOptions = {
  serverUrl: "http://localhost:4000",
  deviceAuthId: "device-auth-id",
  intervalSeconds: 5,
  expiresAt: new Date(8_640_000_000_000_000).toISOString(),
};

describe("pollDeviceLogin", () => {
  it("polls through pending and slow_down, then resolves with the token", async () => {
    const { fetchImpl, sleep, sleeps } = pollHarness([
      jsonResponse({ status: "pending", interval: 5 }),
      jsonResponse({ status: "pending", interval: 10 }),
      successResponse("jwt-token"),
    ]);

    const token = await pollDeviceLogin({ ...baseOptions, fetchImpl, sleep });

    expect(token).toBe("jwt-token");
    // First sleep uses the start interval; the slow_down response (interval 10)
    // backs off the sleep that precedes the final poll.
    expect(sleeps).toEqual([5000, 5000, 10000]);
  });

  it("rejects when the login is denied", async () => {
    const { fetchImpl, sleep } = pollHarness([
      jsonResponse({ status: "denied", error: "GitHub device login was denied" }, { status: 403 }),
    ]);

    await expect(pollDeviceLogin({ ...baseOptions, fetchImpl, sleep })).rejects.toThrow(/denied/);
  });

  it("rejects when the server reports the login expired", async () => {
    const { fetchImpl, sleep } = pollHarness([
      jsonResponse({ status: "expired", error: "GitHub device login expired" }, { status: 410 }),
    ]);

    await expect(pollDeviceLogin({ ...baseOptions, fetchImpl, sleep })).rejects.toThrow(/expired/);
  });

  it("rejects locally once the start expiry passes without approval", async () => {
    const { fetchImpl, sleep } = pollHarness([]);

    await expect(
      pollDeviceLogin({
        ...baseOptions,
        expiresAt: new Date(1000).toISOString(),
        now: () => 2000,
        fetchImpl,
        sleep,
      }),
    ).rejects.toThrow(/expired/);
  });

  it("rejects when success arrives without a session cookie", async () => {
    const { fetchImpl, sleep } = pollHarness([jsonResponse({ status: "success" })]);

    await expect(pollDeviceLogin({ ...baseOptions, fetchImpl, sleep })).rejects.toThrow(
      /no session token/,
    );
  });

  it("rejects on unknown error payloads with the server message", async () => {
    const { fetchImpl, sleep } = pollHarness([
      jsonResponse({ status: "error", error: "GitHub login failed" }, { status: 400 }),
    ]);

    await expect(pollDeviceLogin({ ...baseOptions, fetchImpl, sleep })).rejects.toThrow(
      "GitHub login failed",
    );
  });
});
