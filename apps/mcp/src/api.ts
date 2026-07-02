export class TraceError extends Error {}

/** Raised when no usable credential is available; carries a user-facing hint. */
export class TraceAuthError extends TraceError {}

/**
 * The narrow surface the Trace MCP tools depend on. Both the stdio
 * `TraceClient` (device-flow / saved credentials) and the server-side
 * `StaticTraceClient` (a fixed bearer token) implement it, so the same tool
 * registrations work in-process on the backend and as a standalone CLI.
 */
export interface TraceApi {
  request<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
  getOrganizationId(): Promise<string>;
  getDefaultChannelId(): string | null;
}
