import http from "node:http";
import WebSocket from "ws";
import type { BridgeMessage } from "@trace/shared";

type SendFn = (message: BridgeMessage) => void;
const CONNECT_RETRY_DELAYS_MS = [100, 200, 400, 800] as const;
const RETRYABLE_ERROR_CODES = new Set(["ECONNREFUSED", "ECONNRESET"]);
const RETRYABLE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Responses are buffered whole (single-shot proxy — no streaming protocol yet),
// so cap the buffer. Without this a streaming/SSE endpoint that never ends grows
// `chunks` without bound and OOM-kills every session sharing the runtime.
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024;

export class EndpointForwarder {
  private sockets = new Map<string, WebSocket>();

  constructor(private readonly send: SendFn) {}

  destroy(): void {
    for (const socket of this.sockets.values()) socket.close();
    this.sockets.clear();
  }

  proxyHttp(options: {
    requestId: string;
    port: number;
    method: string;
    path: string;
    headers: Record<string, string | string[]>;
    bodyBase64?: string;
  }): void {
    const body = options.bodyBase64 ? Buffer.from(options.bodyBase64, "base64") : undefined;
    const request = (attempt: number) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port: options.port,
          method: options.method,
          path: options.path,
          headers: options.headers,
          timeout: 60_000,
        },
        (response) => {
          const chunks: Buffer[] = [];
          let total = 0;
          let overflowed = false;
          response.on("data", (chunk: Buffer) => {
            if (overflowed) return;
            total += chunk.length;
            if (total > MAX_RESPONSE_BYTES) {
              overflowed = true;
              response.destroy();
              req.destroy();
              this.send({
                type: "endpoint_http_error",
                requestId: options.requestId,
                error: "Response body exceeds proxy limit",
              });
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            if (overflowed) return;
            this.send({
              type: "endpoint_http_response",
              requestId: options.requestId,
              status: response.statusCode ?? 502,
              headers: response.headers as Record<string, string | string[]>,
              bodyBase64: Buffer.concat(chunks).toString("base64"),
            });
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error("Proxy request timed out")));
      req.on("error", (error: NodeJS.ErrnoException) => {
        const retryDelay = CONNECT_RETRY_DELAYS_MS[attempt];
        if (
          retryDelay !== undefined &&
          RETRYABLE_METHODS.has(options.method.toUpperCase()) &&
          RETRYABLE_ERROR_CODES.has(error.code ?? "")
        ) {
          setTimeout(() => request(attempt + 1), retryDelay);
          return;
        }
        this.send({
          type: "endpoint_http_error",
          requestId: options.requestId,
          error: error.message,
        });
      });
      if (body) req.write(body);
      req.end();
    };
    request(0);
  }

  openWebSocket(options: {
    requestId: string;
    port: number;
    path: string;
    headers: Record<string, string | string[]>;
    protocols?: string[];
  }): void {
    const url = `ws://127.0.0.1:${options.port}${options.path}`;
    const socket = options.protocols?.length
      ? new WebSocket(url, options.protocols, { headers: options.headers })
      : new WebSocket(url, { headers: options.headers });
    this.sockets.set(options.requestId, socket);
    socket.on("open", () =>
      this.send({ type: "endpoint_ws_opened", requestId: options.requestId }),
    );
    socket.on("message", (data, isBinary) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      this.send({
        type: "endpoint_ws_data",
        requestId: options.requestId,
        dataBase64: buffer.toString("base64"),
        isBinary,
      });
    });
    socket.on("close", (code, reason) => {
      this.sockets.delete(options.requestId);
      this.send({
        type: "endpoint_ws_closed",
        requestId: options.requestId,
        code,
        reason: reason.toString("utf8"),
      });
    });
    socket.on("error", (error) => {
      this.sockets.delete(options.requestId);
      this.send({
        type: "endpoint_ws_closed",
        requestId: options.requestId,
        code: 1011,
        reason: error.message,
      });
    });
  }

  sendWebSocketData(requestId: string, dataBase64: string, isBinary = true): void {
    const socket = this.sockets.get(requestId);
    if (socket?.readyState !== WebSocket.OPEN) return;
    const data = Buffer.from(dataBase64, "base64");
    socket.send(isBinary ? data : data.toString("utf8"), { binary: isBinary });
  }

  closeWebSocket(requestId: string, code?: number, reason?: string): void {
    const socket = this.sockets.get(requestId);
    if (!socket) return;
    // Delete first: `ws.close()` throws RangeError for reserved codes (1005/1006)
    // that the upstream server may report, and the old code left the entry (and
    // the upstream socket) dangling when it threw. Fall back to a bare close.
    this.sockets.delete(requestId);
    try {
      socket.close(code, reason);
    } catch {
      try {
        socket.close();
      } catch {
        // already closing/closed
      }
    }
  }
}
