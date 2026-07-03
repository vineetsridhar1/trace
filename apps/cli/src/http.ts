import { getConfigValue, getToken } from "./config.js";

/** Same storage key client-core's auth store uses via Platform.storage, so the
 *  CLI commands and the headless runtime (ticket 04) share the active org. */
export const ACTIVE_ORG_CONFIG_KEY = "trace_active_org";

export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const orgId = getConfigValue(ACTIVE_ORG_CONFIG_KEY);
  if (orgId) headers["X-Organization-Id"] = orgId;
  return headers;
}

export function exitUnauthenticated(): never {
  console.error("Not authenticated. Run `trace login`.");
  process.exit(1);
}

/** Authenticated fetch against the Trace server. Exits with the login hint on 401. */
export async function apiFetch(
  serverUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(new URL(path, serverUrl), {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  });
  if (response.status === 401) exitUnauthenticated();
  return response;
}

interface GraphqlError {
  message: string;
  extensions?: { code?: string };
}

export async function graphqlRequest<T>(
  serverUrl: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await apiFetch(serverUrl, "/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const payload = (await response.json()) as { data?: T; errors?: GraphqlError[] };
  if (payload.errors?.some((error) => error.extensions?.code === "UNAUTHENTICATED")) {
    exitUnauthenticated();
  }
  if (!response.ok || (payload.errors?.length ?? 0) > 0) {
    throw new Error(payload.errors?.[0]?.message ?? `GraphQL request failed (${response.status})`);
  }
  if (payload.data === undefined) {
    throw new Error("GraphQL response contained no data");
  }
  return payload.data;
}

/** The server issues the session JWT via Set-Cookie (`trace_token=...`); the same
 *  JWT is accepted as a Bearer token, so the CLI captures it from the header. */
export function extractSessionToken(response: Response): string | null {
  for (const cookie of response.headers.getSetCookie()) {
    const match = /^trace_token=([^;]+)/.exec(cookie);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}
