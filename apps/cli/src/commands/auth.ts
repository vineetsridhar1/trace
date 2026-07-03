import type { Command } from "commander";
import {
  clearToken,
  getConfigValue,
  getToken,
  resolveServerUrl,
  setConfigValue,
  setToken,
} from "../config.js";
import { ACTIVE_ORG_CONFIG_KEY, apiFetch, extractSessionToken } from "../http.js";
import { pollDeviceLogin, startDeviceLogin } from "../auth/device-flow.js";

interface MeUser {
  id: string;
  email?: string | null;
  name?: string | null;
  orgMemberships: Array<{
    organizationId: string;
    role: string;
    organization: { id: string; name: string };
  }>;
}

async function fetchMe(serverUrl: string): Promise<MeUser> {
  const response = await apiFetch(serverUrl, "/auth/me");
  if (!response.ok) {
    throw new Error(`Failed to load the signed-in user (${response.status})`);
  }
  const payload = (await response.json()) as { user: MeUser };
  return payload.user;
}

/** Persist the active org after login: keep a still-valid stored value,
 *  otherwise fall back to the first membership. */
function persistActiveOrg(user: MeUser): string | null {
  const stored = getConfigValue(ACTIVE_ORG_CONFIG_KEY);
  const valid = user.orgMemberships.find((m) => m.organizationId === stored);
  const orgId = valid?.organizationId ?? user.orgMemberships[0]?.organizationId ?? null;
  if (orgId) setConfigValue(ACTIVE_ORG_CONFIG_KEY, orgId);
  return orgId;
}

function displayName(user: MeUser): string {
  return user.name ?? user.email ?? user.id;
}

async function loginLocal(serverUrl: string, name?: string): Promise<void> {
  const response = await fetch(new URL("/auth/local/login", serverUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(name ? { name } : {}),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `Local login failed (${response.status})`);
  }
  const token = extractSessionToken(response);
  if (!token) {
    throw new Error("Login succeeded but the server returned no session token.");
  }
  setToken(token);
  const payload = (await response.json()) as {
    organizationId?: string;
    user?: { name?: string | null };
  };
  if (payload.organizationId) {
    setConfigValue(ACTIVE_ORG_CONFIG_KEY, payload.organizationId);
  }
  console.log(`Logged in to ${serverUrl}${payload.user?.name ? ` as ${payload.user.name}` : ""}`);
}

async function loginDeviceFlow(serverUrl: string): Promise<void> {
  const start = await startDeviceLogin(serverUrl);
  console.log(`Open ${start.verificationUri} and enter code: ${start.userCode}`);
  console.error("Waiting for approval…");
  const token = await pollDeviceLogin({
    serverUrl,
    deviceAuthId: start.deviceAuthId,
    intervalSeconds: start.interval,
    expiresAt: start.expiresAt,
  });
  setToken(token);
  const user = await fetchMe(serverUrl);
  persistActiveOrg(user);
  console.log(`Logged in to ${serverUrl} as ${displayName(user)}`);
}

export function registerAuthCommands(program: Command): void {
  program
    .command("login")
    .description("Authenticate and store a bearer token")
    .option("--local", "log in to a local-mode server (pnpm dev:local)")
    .option("--name <name>", "local-mode display name (with --local)")
    .action(async (opts: { local?: boolean; name?: string }, cmd: Command) => {
      const serverUrl = resolveServerUrl(cmd.optsWithGlobals().server as string | undefined);
      if (opts.local) {
        await loginLocal(serverUrl, opts.name);
      } else {
        await loginDeviceFlow(serverUrl);
      }
    });

  program
    .command("logout")
    .description("Sign out and clear stored credentials")
    .action(async (_opts: unknown, cmd: Command) => {
      const serverUrl = resolveServerUrl(cmd.optsWithGlobals().server as string | undefined);
      const token = getToken();
      if (token) {
        try {
          await fetch(new URL("/auth/logout", serverUrl), {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          });
        } catch {
          // Clearing local credentials matters more than the server round-trip.
        }
      }
      clearToken();
      console.log("Logged out.");
    });

  program
    .command("whoami")
    .description("Show the signed-in user, server, and active organization")
    .action(async (_opts: unknown, cmd: Command) => {
      const globals = cmd.optsWithGlobals();
      const serverUrl = resolveServerUrl(globals.server as string | undefined);
      const user = await fetchMe(serverUrl);
      const activeOrgId =
        getConfigValue(ACTIVE_ORG_CONFIG_KEY) ?? user.orgMemberships[0]?.organizationId ?? null;
      const activeOrg =
        user.orgMemberships.find((m) => m.organizationId === activeOrgId)?.organization ?? null;
      if (globals.json) {
        console.log(
          JSON.stringify({
            user: { id: user.id, email: user.email ?? null, name: user.name ?? null },
            server: serverUrl,
            activeOrg: activeOrg ? { id: activeOrg.id, name: activeOrg.name } : null,
          }),
        );
        return;
      }
      console.log(`user:   ${displayName(user)} (${user.id})`);
      console.log(`server: ${serverUrl}`);
      console.log(`org:    ${activeOrg ? `${activeOrg.name} (${activeOrg.id})` : "none"}`);
    });
}
