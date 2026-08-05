import type { Request } from "express";

const APP_VIEWER_CONTEXT_HEADER = "x-trace-app-viewer-context";

export type SnowflakeQueryOptions = {
  sql: string;
  parameters?: Array<string | number | boolean>;
  database?: string;
  schema?: string;
  warehouse?: string;
  timeoutSeconds?: number;
};

export class TraceIntegrationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TraceIntegrationError";
  }
}

async function responseError(response: Response): Promise<TraceIntegrationError> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  const message =
    typeof body?.error === "string"
      ? body.error
      : `Integration request failed (${response.status})`;
  return new TraceIntegrationError(message, response.status);
}

async function snowflakeQuery(
  request: Request,
  bindingId: string,
  options: SnowflakeQueryOptions,
): Promise<unknown> {
  const viewerContext = request.get(APP_VIEWER_CONTEXT_HEADER);
  if (!viewerContext) {
    throw new TraceIntegrationError(
      "This request does not have an authenticated Trace app viewer",
      401,
    );
  }
  const traceServerUrl = process.env.TRACE_SERVER_PUBLIC_URL?.trim();
  if (!traceServerUrl) {
    throw new Error("TRACE_SERVER_PUBLIC_URL is not configured");
  }
  const url = new URL(
    `/runtime/app-integrations/${encodeURIComponent(bindingId)}/snowflake/query`,
    traceServerUrl,
  );
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${viewerContext}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<unknown>;
}

export const trace = {
  integrations: {
    snowflake: {
      query: snowflakeQuery,
    },
  },
};
