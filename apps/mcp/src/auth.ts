import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Extract the `trace_token` JWT from a Set-Cookie response header. */
export function extractTraceToken(setCookie: string | null): string | null {
  const match = setCookie?.match(/trace_token=([^;]+)/);
  return match ? match[1] : null;
}

interface CredentialsFile {
  /** Map of baseUrl -> JWT token. */
  tokens: Record<string, string>;
}

export async function loadSavedToken(path: string, baseUrl: string): Promise<string | null> {
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as CredentialsFile;
    return parsed.tokens?.[baseUrl] ?? null;
  } catch {
    return null;
  }
}

export async function saveToken(path: string, baseUrl: string, token: string): Promise<void> {
  let existing: CredentialsFile = { tokens: {} };
  try {
    existing = JSON.parse(await readFile(path, "utf-8")) as CredentialsFile;
    if (!existing.tokens) existing.tokens = {};
  } catch {
    /* fresh file */
  }
  existing.tokens[baseUrl] = token;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(existing, null, 2), { mode: 0o600 });
}

export interface DeviceStart {
  deviceAuthId: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresAt: string;
}

interface DevicePollResponse {
  status: "pending" | "success" | "expired" | "denied" | "error";
  interval?: number;
  error?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Begin a GitHub device-flow login: returns the code + verification URL. */
export async function startDeviceFlow(baseUrl: string): Promise<DeviceStart> {
  const res = await fetch(`${baseUrl}/auth/github/device/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    throw new Error(`device/start failed (HTTP ${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as DeviceStart;
}

/** Poll a started device flow until the user authorizes; returns the JWT. */
export async function pollDeviceFlow(baseUrl: string, start: DeviceStart): Promise<string> {
  const deadline = Date.parse(start.expiresAt);
  let intervalMs = (start.interval || 5) * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    const pollRes = await fetch(`${baseUrl}/auth/github/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceAuthId: start.deviceAuthId }),
    });
    const poll = (await pollRes.json().catch(() => ({ status: "error" }))) as DevicePollResponse;

    if (poll.status === "pending") {
      if (poll.interval) intervalMs = poll.interval * 1000;
      continue;
    }
    if (poll.status === "success") {
      const token = extractTraceToken(pollRes.headers.get("set-cookie"));
      if (!token) throw new Error("Login succeeded but no trace_token cookie was returned.");
      return token;
    }
    throw new Error(`Login failed (${poll.status}): ${poll.error ?? "unknown error"}`);
  }
  throw new Error("Device login expired before authorization completed.");
}

/**
 * Run the full GitHub device-flow login: prints the code + verification URL via
 * `log` (stderr), polls until the user authorizes, and returns the JWT. Used by
 * the `login` CLI subcommand.
 */
export async function deviceFlowLogin(
  baseUrl: string,
  log: (msg: string) => void,
): Promise<string> {
  const start = await startDeviceFlow(baseUrl);
  log("");
  log("  To authorize trace-mcp:");
  log(`    1. Open ${start.verificationUri}`);
  log(`    2. Enter code: ${start.userCode}`);
  log("");
  log("  Waiting for authorization…");
  return pollDeviceFlow(baseUrl, start);
}
