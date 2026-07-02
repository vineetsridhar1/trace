import { isLocalhost, type TraceConfig } from "./config.js";
import { TraceApi, TraceError, TraceAuthError } from "./api.js";
import {
  extractTraceToken,
  loadSavedToken,
  saveToken,
  startDeviceFlow,
  pollDeviceFlow,
  type DeviceStart,
} from "./auth.js";

export { TraceError, TraceAuthError } from "./api.js";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface AuthMeResponse {
  user: {
    id: string;
    name: string;
    email?: string;
    orgMemberships: Array<{ organizationId: string; organization?: { id: string; name: string } }>;
  };
}

/**
 * Thin client for Trace's GraphQL API.
 *
 * Auth resolution order:
 *   1. `TRACE_TOKEN` env (Bearer) — explicit override.
 *   2. Saved credentials file (JWT obtained via `trace-mcp login` device flow).
 *   3. localhost + local-mode: `POST /auth/local/login` fallback for dev.
 *   4. otherwise: TraceAuthError telling the user to run `trace-mcp login`.
 *
 * The trace_token is a JWT the server accepts as `Authorization: Bearer`, so we
 * send it that way regardless of how it was obtained.
 */
export class TraceClient implements TraceApi {
  private token: string | null;
  private organizationId: string | null;
  private resolved = false;
  /** Shared in-flight device-flow login, so concurrent calls reuse one code. */
  private loginPromise: Promise<void> | null = null;
  /** The active device-flow start info (code/URL), surfaced in auth errors. */
  private activeStart: DeviceStart | null = null;

  constructor(private readonly config: TraceConfig) {
    this.token = config.token;
    this.organizationId = config.organizationId;
  }

  getDefaultChannelId(): string | null {
    return this.config.channelId;
  }

  async getOrganizationId(): Promise<string> {
    await this.ensureAuth();
    if (!this.organizationId) {
      this.organizationId = await this.resolveOrganizationId();
    }
    if (!this.organizationId) {
      throw new TraceError(
        "No organization found for this user. Set TRACE_ORG_ID to pick one explicitly.",
      );
    }
    return this.organizationId;
  }

  private async ensureAuth(): Promise<void> {
    if (this.resolved && this.token) return;

    // 1. Explicit env token already captured in constructor.
    // 2. Saved credentials.
    if (!this.token) {
      this.token = await loadSavedToken(this.config.credentialsPath, this.config.baseUrl);
    }
    // 3. localhost local-mode fallback.
    if (!this.token && isLocalhost(this.config.baseUrl)) {
      this.token = await this.tryLocalLogin();
    }
    if (!this.token) {
      await this.beginReauthOrThrow();
      return;
    }
    this.resolved = true;
  }

  /** True when the client may start a device flow on its own. */
  private autoLoginEnabled(): boolean {
    // A user-supplied TRACE_TOKEN means the caller manages their own credential.
    if (this.config.token) return false;
    if (process.env.TRACE_AUTO_LOGIN === "0") return false;
    return true;
  }

  /**
   * Recover from a missing/expired credential. First tries to adopt a token
   * refreshed elsewhere (file or localhost local-login); otherwise starts a
   * device flow and throws an auth error carrying the code + URL. Returns true
   * if a fresh token was adopted and the request should be retried.
   */
  private async adoptRefreshedToken(usedToken: string | null): Promise<boolean> {
    // A token refreshed in another process / by `login`, or by a background
    // device flow this client started on an earlier call.
    const fileToken = await loadSavedToken(this.config.credentialsPath, this.config.baseUrl);
    const candidate = fileToken && fileToken !== usedToken ? fileToken : this.token;
    if (candidate && candidate !== usedToken) {
      this.token = candidate;
      this.resolved = true;
      return true;
    }
    // localhost dev convenience.
    if (isLocalhost(this.config.baseUrl)) {
      const local = await this.tryLocalLogin();
      if (local && local !== usedToken) {
        this.token = local;
        this.resolved = true;
        return true;
      }
    }
    return false;
  }

  /**
   * Ensure a device-flow login is running in the background (it saves the token
   * for subsequent calls), then either return once a token becomes available
   * within a short grace window, or throw an auth error carrying the code + URL.
   */
  private async beginReauthOrThrow(): Promise<void> {
    if (!this.autoLoginEnabled()) {
      throw new TraceAuthError(
        `Not authenticated to ${this.config.baseUrl}. Run:\n` +
          `  TRACE_BASE_URL=${this.config.baseUrl} node dist/index.js login\n` +
          `or set TRACE_TOKEN to a pre-minted JWT.`,
      );
    }

    if (!this.loginPromise) {
      this.loginPromise = (async () => {
        const start = await startDeviceFlow(this.config.baseUrl);
        this.activeStart = start;
        process.stderr.write(
          `\n[trace-mcp] Re-authentication required. Open ${start.verificationUri} and enter ${start.userCode}\n`,
        );
        const token = await pollDeviceFlow(this.config.baseUrl, start);
        await saveToken(this.config.credentialsPath, this.config.baseUrl, token);
        this.token = token;
        this.resolved = true;
      })();
      // Reset the singleton when it settles so a later expiry can start fresh.
      this.loginPromise
        .catch(() => undefined)
        .finally(() => {
          this.loginPromise = null;
          this.activeStart = null;
        });
    }

    // Wait briefly: the login may finish (fast re-auth), or at least produce a
    // code to surface to the user.
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      if (this.resolved && this.token) return;
      if (this.activeStart) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (this.resolved && this.token) return;

    const start = this.activeStart;
    throw new TraceAuthError(
      start
        ? `Trace session expired — re-authenticate to continue.\n` +
          `  1. Open ${start.verificationUri}\n` +
          `  2. Enter code: ${start.userCode}\n` +
          `Then retry this tool. The new token is saved automatically once you authorize.`
        : `Trace session expired and re-authentication could not be started. ` +
          `Run \`node dist/index.js login\`.`,
    );
  }

  private async tryLocalLogin(): Promise<string | null> {
    try {
      const res = await fetch(`${this.config.baseUrl}/auth/local/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.config.localUserName ? { name: this.config.localUserName } : {}),
      });
      if (!res.ok) return null;
      const token = extractTraceToken(res.headers.get("set-cookie"));
      const body = (await res.json().catch(() => null)) as { organizationId?: string } | null;
      if (body?.organizationId && !this.organizationId) this.organizationId = body.organizationId;
      return token;
    } catch {
      return null;
    }
  }

  private async resolveOrganizationId(): Promise<string | null> {
    const res = await this.authFetch("/auth/me", {});
    if (!res.ok) return null;
    const body = (await res.json()) as AuthMeResponse;
    return body.user?.orgMemberships?.[0]?.organizationId ?? null;
  }

  /**
   * Authenticated fetch with one transparent 401 recovery: adopt a refreshed
   * token (file / localhost / background device flow) and retry once. A genuine
   * expiry surfaces as a TraceAuthError carrying the device-login code.
   */
  private async authFetch(path: string, init: RequestInit): Promise<Response> {
    await this.ensureAuth();
    for (let attempt = 0; ; attempt++) {
      const usedToken = this.token;
      const res = await fetch(`${this.config.baseUrl}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${usedToken}` },
      });
      if (res.status !== 401) return res;
      if (attempt >= 1) {
        throw new TraceAuthError("Trace rejected the credential (401) after re-authentication.");
      }
      this.resolved = false;
      const adopted = await this.adoptRefreshedToken(usedToken);
      if (!adopted) await this.beginReauthOrThrow(); // returns only if a token became available
    }
  }

  async request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await this.authFetch("/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      throw new TraceError(`Trace GraphQL request failed: HTTP ${res.status}. ${await res.text()}`);
    }

    const json = (await res.json()) as GraphQLResponse<T>;
    if (json.errors?.length) throw new TraceError(json.errors.map((e) => e.message).join("; "));
    if (json.data === undefined) throw new TraceError("Trace GraphQL response contained no data.");
    return json.data;
  }
}
