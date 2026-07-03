import { extractSessionToken } from "../http.js";

export interface DeviceLoginStart {
  deviceAuthId: string;
  userCode: string;
  verificationUri: string;
  expiresAt: string;
  interval: number;
}

type PollPayload = {
  status?: "pending" | "success" | "expired" | "denied" | "error";
  interval?: number;
  error?: string;
};

export async function startDeviceLogin(
  serverUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeviceLoginStart> {
  const response = await fetchImpl(new URL("/auth/github/device/start", serverUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const payload = (await response.json()) as Partial<DeviceLoginStart> & { error?: string };
  if (
    !response.ok ||
    !payload.deviceAuthId ||
    !payload.userCode ||
    !payload.verificationUri ||
    typeof payload.interval !== "number" ||
    !payload.expiresAt
  ) {
    throw new Error(payload.error ?? `Failed to start GitHub device login (${response.status})`);
  }
  return payload as DeviceLoginStart;
}

export interface PollDeviceLoginOptions {
  serverUrl: string;
  deviceAuthId: string;
  intervalSeconds: number;
  expiresAt: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Poll `/auth/github/device/poll` until a session token is issued. Honors the
 *  server-provided interval (which grows on GitHub `slow_down` responses) and
 *  terminates on denied/expired. Resolves with the bearer token. */
export async function pollDeviceLogin(options: PollDeviceLoginOptions): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const expiresAtMs = Date.parse(options.expiresAt);
  let intervalSeconds = Math.max(1, options.intervalSeconds);

  for (;;) {
    await sleep(intervalSeconds * 1000);
    if (Number.isFinite(expiresAtMs) && now() >= expiresAtMs) {
      throw new Error("GitHub device login expired. Run `trace login` to start over.");
    }

    const response = await fetchImpl(new URL("/auth/github/device/poll", options.serverUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceAuthId: options.deviceAuthId }),
    });

    let payload: PollPayload;
    try {
      payload = (await response.json()) as PollPayload;
    } catch {
      payload = { status: "error", error: `Unexpected poll response (${response.status})` };
    }

    switch (payload.status) {
      case "pending":
        if (typeof payload.interval === "number" && payload.interval > 0) {
          intervalSeconds = payload.interval;
        }
        continue;
      case "success": {
        const token = extractSessionToken(response);
        if (!token) {
          throw new Error("Login succeeded but the server returned no session token.");
        }
        return token;
      }
      case "denied":
        throw new Error("GitHub device login was denied.");
      case "expired":
        throw new Error("GitHub device login expired. Run `trace login` to start over.");
      default:
        throw new Error(payload.error ?? `GitHub device login failed (${response.status})`);
    }
  }
}
