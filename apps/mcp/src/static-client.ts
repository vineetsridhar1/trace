import { TraceApi, TraceError } from "./api.js";

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface AuthMeResponse {
  user: {
    orgMemberships: Array<{ organizationId: string }>;
  };
}

export interface StaticTraceClientConfig {
  /** Base URL of the Trace server, e.g. http://127.0.0.1:4000 */
  baseUrl: string;
  /** Pre-minted JWT sent as `Authorization: Bearer`. */
  token: string;
  /** Organization id; when omitted it is resolved lazily from `/auth/me`. */
  organizationId?: string;
  /** Default channel for `start_session` when no channel/repo/group is given. */
  channelId?: string;
}

/**
 * A {@link TraceApi} backed by a single fixed bearer token. The hosted `/mcp`
 * endpoint builds one per request from the caller's authenticated token, so it
 * carries no interactive-login machinery — every request just forwards the
 * token to the Trace GraphQL API over loopback.
 */
export class StaticTraceClient implements TraceApi {
  private readonly baseUrl: string;
  private readonly token: string;
  private organizationId: string | null;
  private readonly channelId: string | null;

  constructor(config: StaticTraceClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.organizationId = config.organizationId ?? null;
    this.channelId = config.channelId ?? null;
  }

  getDefaultChannelId(): string | null {
    return this.channelId;
  }

  async getOrganizationId(): Promise<string> {
    if (this.organizationId) return this.organizationId;
    const res = await fetch(`${this.baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      throw new TraceError(`Failed to resolve organization from /auth/me: HTTP ${res.status}`);
    }
    const body = (await res.json()) as AuthMeResponse;
    const organizationId = body.user?.orgMemberships?.[0]?.organizationId ?? null;
    if (!organizationId) {
      throw new TraceError("No organization found for this user.");
    }
    this.organizationId = organizationId;
    return organizationId;
  }

  async request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
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
