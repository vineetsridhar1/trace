import type { Readable, Writable } from "node:stream";

/** Single integer protocol version; bump on breaking change. */
export const PROTOCOL_VERSION = 1;

export const RPC_ERROR_CODES = {
  // JSON-RPC 2.0 standard codes
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Trace daemon codes
  SERVER_DISCONNECTED: -32000,
  UNAUTHENTICATED: -32001,
  NOT_INITIALIZED: -32002,
  VERSION_MISMATCH: -32003,
} as const;

export class RpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

type RpcId = string | number | null;

interface RpcRequest {
  jsonrpc?: string;
  id?: RpcId;
  method?: unknown;
  params?: unknown;
}

export type RpcHandler = (params: Record<string, unknown>) => Promise<unknown> | unknown;

export interface RpcServerOptions {
  input: Readable;
  output: Writable;
  /** Called with every inbound method name before dispatch; return an RpcError to reject. */
  guard?: (method: string) => RpcError | null;
  onEnd?: () => void;
}

/**
 * NDJSON-framed JSON-RPC 2.0 endpoint: one JSON object per line, requests in
 * on `input`, responses/notifications out on `output`. The framing layer is
 * independent of the methods — the daemon registers handlers into it.
 */
export class RpcServer {
  private readonly handlers = new Map<string, RpcHandler>();
  private readonly output: Writable;
  private readonly guard?: (method: string) => RpcError | null;
  private buffer = "";
  /** Requests dispatch strictly in arrival order, one at a time. */
  private queue: Promise<void> = Promise.resolve();

  constructor(options: RpcServerOptions) {
    this.output = options.output;
    this.guard = options.guard;
    options.input.setEncoding?.("utf8");
    options.input.on("data", (chunk: string | Buffer) => {
      this.feed(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });
    options.input.on("end", () => {
      // Let in-flight requests finish before the EOF teardown runs.
      this.queue = this.queue.then(() => options.onEnd?.());
    });
  }

  register(method: string, handler: RpcHandler): void {
    this.handlers.set(method, handler);
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  /** Line-buffered reader tolerant of partial and joined chunks. */
  private feed(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline === -1) return;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line.length > 0) {
        this.handleLine(line);
      }
    }
  }

  private handleLine(line: string): void {
    let request: RpcRequest;
    try {
      request = JSON.parse(line) as RpcRequest;
    } catch {
      this.respondError(null, new RpcError(RPC_ERROR_CODES.PARSE_ERROR, "Parse error"));
      return;
    }
    if (typeof request !== "object" || request === null || typeof request.method !== "string") {
      this.respondError(
        request?.id ?? null,
        new RpcError(RPC_ERROR_CODES.INVALID_REQUEST, "Invalid request"),
      );
      return;
    }
    const { id, method, params } = request;
    this.queue = this.queue.then(() => this.dispatch(id ?? null, method as string, params));
  }

  private async dispatch(id: RpcId, method: string, params: unknown): Promise<void> {
    const isNotification = id === null || id === undefined;
    const rejected = this.guard?.(method) ?? null;
    if (rejected) {
      if (!isNotification) this.respondError(id, rejected);
      return;
    }
    const handler = this.handlers.get(method);
    if (!handler) {
      if (!isNotification) {
        this.respondError(
          id,
          new RpcError(RPC_ERROR_CODES.METHOD_NOT_FOUND, `Method not found: ${method}`),
        );
      }
      return;
    }
    const record =
      params && typeof params === "object" && !Array.isArray(params)
        ? (params as Record<string, unknown>)
        : {};
    try {
      const result = await handler(record);
      if (!isNotification) {
        this.write({ jsonrpc: "2.0", id, result: result ?? null });
      }
    } catch (error) {
      if (isNotification) return;
      if (error instanceof RpcError) {
        this.respondError(id, error);
      } else {
        this.respondError(
          id,
          new RpcError(
            RPC_ERROR_CODES.INTERNAL_ERROR,
            error instanceof Error ? error.message : String(error),
          ),
        );
      }
    }
  }

  private respondError(id: RpcId, error: RpcError): void {
    this.write({
      jsonrpc: "2.0",
      id,
      error: {
        code: error.code,
        message: error.message,
        ...(error.data !== undefined ? { data: error.data } : {}),
      },
    });
  }

  private write(frame: Record<string, unknown>): void {
    this.output.write(`${JSON.stringify(frame)}\n`);
  }
}
