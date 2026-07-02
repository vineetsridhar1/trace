import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_BASE_URL = "https://trace.infra.opendoor.com";

export interface TraceConfig {
  /** Base URL of the Trace server, e.g. https://trace.infra.opendoor.com */
  baseUrl: string;
  /**
   * Optional local-user name to log in as when running against a localhost
   * server in local mode. Ignored on hosted servers.
   */
  localUserName: string | null;
  /**
   * Optional pre-minted JWT. When set, it is sent as a Bearer token and all
   * interactive login is skipped. Highest-priority credential.
   */
  token: string | null;
  /** Optional organization id override (otherwise taken from /auth/me). */
  organizationId: string | null;
  /** Optional channel id used as the default session destination. */
  channelId: string | null;
  /** Path to the persisted credentials file (written by the device-flow login). */
  credentialsPath: string;
}

function credentialsDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  return xdg ? join(xdg, "trace-mcp") : join(homedir(), ".config", "trace-mcp");
}

export function loadConfig(): TraceConfig {
  const baseUrl = (process.env.TRACE_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const localUserName = process.env.TRACE_LOCAL_USER?.trim() || null;
  const token = process.env.TRACE_TOKEN?.trim() || null;
  const organizationId = process.env.TRACE_ORG_ID?.trim() || null;
  const channelId = process.env.TRACE_CHANNEL_ID?.trim() || null;
  const credentialsPath = process.env.TRACE_CREDENTIALS_PATH?.trim() || join(credentialsDir(), "credentials.json");
  return { baseUrl, localUserName, token, organizationId, channelId, credentialsPath };
}

export function isLocalhost(baseUrl: string): boolean {
  try {
    const { hostname } = new URL(baseUrl);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
