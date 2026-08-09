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

export type IntegrationRequestOptions = {
  method?: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean>;
  body?: unknown;
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
  integration: string,
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
    `/runtime/app-integrations/${encodeURIComponent(integration)}/snowflake/query`,
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

async function integrationRequest(
  request: Request,
  integration: string,
  options: IntegrationRequestOptions,
): Promise<unknown> {
  const viewerContext = request.get(APP_VIEWER_CONTEXT_HEADER);
  if (!viewerContext) {
    throw new TraceIntegrationError(
      "This request does not have an authenticated Trace app viewer",
      401,
    );
  }
  const traceServerUrl = process.env.TRACE_SERVER_PUBLIC_URL?.trim();
  if (!traceServerUrl) throw new Error("TRACE_SERVER_PUBLIC_URL is not configured");
  const response = await fetch(
    new URL(`/runtime/app-integrations/${encodeURIComponent(integration)}/request`, traceServerUrl),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${viewerContext}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ method: options.method ?? "GET", ...options }),
    },
  );
  if (!response.ok) throw await responseError(response);
  const contentType = response.headers.get("content-type");
  return contentType?.includes("application/json") ? response.json() : response.text();
}

export const trace = {
  integrations: {
    request: integrationRequest,
    snowflake: {
      query: snowflakeQuery,
    },
  },
};
