import { CliError, ExitCode } from "./errors.js";

type GraphQlError = {
  message?: unknown;
  extensions?: { code?: unknown };
};

type GraphQlResponse<T> = {
  data?: T;
  errors?: GraphQlError[];
};

function errorFromStatus(status: number, message: string): CliError {
  if (status === 401) return new CliError(message, ExitCode.authentication, "authentication");
  if (status === 403) return new CliError(message, ExitCode.authorization, "authorization");
  if (status >= 400 && status < 500) {
    return new CliError(message, ExitCode.validation, "validation");
  }
  return new CliError(message, ExitCode.server, "server");
}

function graphQlError(error: GraphQlError): CliError {
  const message = typeof error.message === "string" ? error.message : "GraphQL request failed";
  const code = error.extensions?.code;
  if (code === "UNAUTHENTICATED") {
    return new CliError(message, ExitCode.authentication, "authentication");
  }
  if (code === "FORBIDDEN") {
    return new CliError(message, ExitCode.authorization, "authorization");
  }
  if (code === "BAD_USER_INPUT" || code === "NOT_FOUND") {
    return new CliError(message, ExitCode.validation, "validation");
  }
  return new CliError(message, ExitCode.server, "server");
}

export class TraceClient {
  constructor(
    readonly serverUrl: string,
    private readonly token: string,
    readonly organizationId?: string,
  ) {}

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      "X-Trace-Client-Source": "cli",
      ...(this.organizationId ? { "X-Organization-Id": this.organizationId } : {}),
      ...extra,
    };
  }

  async http<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(new URL(path, this.serverUrl), {
        method: init.method ?? "GET",
        headers: this.headers(),
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new CliError(
        `Could not connect to ${this.serverUrl}`,
        ExitCode.connectivity,
        "connectivity",
      );
    }
    const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
    if (!response.ok) {
      throw errorFromStatus(
        response.status,
        typeof payload.error === "string" ? payload.error : `Server returned ${response.status}`,
      );
    }
    return payload as T;
  }

  async graphql<TData, TVariables extends Record<string, unknown>>(
    query: string,
    variables: TVariables,
  ): Promise<TData> {
    let response: Response;
    try {
      response = await fetch(new URL("/graphql", this.serverUrl), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ query, variables }),
      });
    } catch {
      throw new CliError(
        `Could not connect to ${this.serverUrl}`,
        ExitCode.connectivity,
        "connectivity",
      );
    }
    const payload = (await response.json().catch(() => ({}))) as GraphQlResponse<TData>;
    if (!response.ok) {
      throw errorFromStatus(response.status, `Server returned ${response.status}`);
    }
    if (payload.errors?.length) throw graphQlError(payload.errors[0] ?? {});
    if (!payload.data) throw new CliError("Server returned no data", ExitCode.server, "server");
    return payload.data;
  }

  async subscribe<TData, TVariables extends Record<string, unknown>>(
    query: string,
    variables: TVariables,
    onData: (data: TData) => void,
  ): Promise<void> {
    const url = new URL("/graphql", this.serverUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url, "graphql-transport-ws");
    await new Promise<void>((resolve, reject) => {
      let subscribed = false;
      const close = () => socket.close(1000, "CLI stopped following");
      process.once("SIGINT", close);
      socket.addEventListener("open", () => {
        socket.send(
          JSON.stringify({
            type: "connection_init",
            payload: {
              token: this.token,
              organizationId: this.organizationId,
              clientSource: "cli",
            },
          }),
        );
      });
      socket.addEventListener("message", (message) => {
        let payload: {
          type?: unknown;
          payload?: { data?: TData } | GraphQlError[];
        };
        try {
          payload = JSON.parse(String(message.data)) as typeof payload;
        } catch {
          return;
        }
        if (payload.type === "connection_ack" && !subscribed) {
          subscribed = true;
          socket.send(
            JSON.stringify({ id: "trace-cli", type: "subscribe", payload: { query, variables } }),
          );
        } else if (
          payload.type === "next" &&
          payload.payload &&
          !Array.isArray(payload.payload) &&
          payload.payload.data
        ) {
          onData(payload.payload.data);
        } else if (payload.type === "error") {
          const errors = Array.isArray(payload.payload) ? payload.payload : [];
          reject(graphQlError(errors[0] ?? {}));
          socket.close();
        } else if (payload.type === "complete") {
          socket.close(1000, "Subscription completed");
        }
      });
      socket.addEventListener("error", () => {
        reject(
          new CliError(`Could not connect to ${url.origin}`, ExitCode.connectivity, "connectivity"),
        );
      });
      socket.addEventListener("close", () => {
        process.removeListener("SIGINT", close);
        resolve();
      });
    });
  }
}
