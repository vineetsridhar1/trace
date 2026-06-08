import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import type { Socket } from "net";
import { WebSocketServer, type WebSocket } from "ws";
import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { parseCookieToken, verifyToken } from "../lib/auth.js";
import { canViewSessionGroup } from "./access.js";
import {
  bodyPreview,
  endpointProxyMaxRequestBodyBytes,
  endpointProxyRequestTimeoutMs,
  extractEndpointKey,
  forwardableRequestHeaders,
  forwardableResponseHeaders,
  sanitizeHeaders,
  shouldCaptureBodies,
  shouldCaptureHeaders,
} from "./endpoint-utils.js";

type PendingHttp = {
  endpointId: string;
  trafficEntryId: string;
  trafficWrite: Promise<unknown>;
  startedAt: number;
  response: ServerResponse;
  timer: ReturnType<typeof setTimeout>;
};

type PendingWs = {
  client: WebSocket;
  runtimeId: string;
  endpointId: string;
};

function requestPath(req: IncomingMessage): { path: string; query: string | null } {
  const raw = req.url ?? "/";
  const [path, query] = raw.split("?", 2);
  return { path: path || "/", query: query ?? null };
}

function authenticatedUserId(req: IncomingMessage): string | null {
  const cookieToken = parseCookieToken(req.headers.cookie);
  return cookieToken ? verifyToken(cookieToken) : null;
}

class RequestBodyTooLargeError extends Error {}

async function readRequestBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) {
      req.destroy();
      throw new RequestBodyTooLargeError();
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export class EndpointProxyService {
  private pendingHttp = new Map<string, PendingHttp>();
  private pendingWs = new Map<string, PendingWs>();
  private wsServer = new WebSocketServer({ noServer: true });

  extractKey(host: string | undefined | null) {
    return extractEndpointKey(host);
  }

  isEndpointHost(host: string | undefined | null) {
    return this.extractKey(host) != null;
  }

  async handleHttpRequest(req: IncomingMessage, res: ServerResponse, endpointKey: string) {
    const endpoint = await prisma.sessionEndpoint.findUnique({
      where: { key: endpointKey },
    });
    if (!endpoint) {
      res.writeHead(404).end("Endpoint not found");
      return;
    }
    if (endpoint.status === "revoked") {
      res.writeHead(410).end("Endpoint revoked");
      return;
    }
    if (endpoint.status !== "enabled") {
      res.writeHead(503).end("Endpoint unavailable");
      return;
    }
    if (endpoint.accessMode === "private") {
      const userId = authenticatedUserId(req);
      if (!userId) {
        res.writeHead(401).end("Authentication required");
        return;
      }
      const group = await prisma.sessionGroup.findFirst({
        where: { id: endpoint.sessionGroupId, organizationId: endpoint.organizationId },
        select: { visibility: true, ownerUserId: true },
      });
      if (!group || !canViewSessionGroup(group, userId)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
    }
    if (endpoint.expiresAt && endpoint.expiresAt <= new Date()) {
      res.writeHead(410).end("Endpoint expired");
      return;
    }
    const process = await prisma.sessionApplicationProcess.findUnique({
      where: {
        sessionGroupId_appConfigId_processConfigId: {
          sessionGroupId: endpoint.sessionGroupId,
          appConfigId: endpoint.appConfigId,
          processConfigId: endpoint.processConfigId,
        },
      },
    });
    if (!process || process.status !== "running" || !process.runtimeInstanceId) {
      res.writeHead(503).end("Process is not running");
      return;
    }
    const runtime = sessionRouter.getRuntime(process.runtimeInstanceId, endpoint.organizationId);
    if (!runtime || runtime.ws.readyState !== runtime.ws.OPEN) {
      res.writeHead(503).end("Runtime disconnected");
      return;
    }

    const requestId = randomUUID();
    const { path, query } = requestPath(req);
    let requestBody: Buffer;
    try {
      requestBody = await readRequestBody(req, endpointProxyMaxRequestBodyBytes());
    } catch (err) {
      if (err instanceof RequestBodyTooLargeError) {
        if (!res.headersSent) res.writeHead(413);
        res.end("Request body too large");
        return;
      }
      throw err;
    }
    const requestBodyCapture = bodyPreview(requestBody);
    const requestHeaders = shouldCaptureHeaders(endpoint.trafficCaptureMode)
      ? sanitizeHeaders(req.headers)
      : undefined;
    // Record the request off the forwarding hot path: a missing/slow traffic row
    // must never add latency to (or block) the proxied request. Response updates
    // chain off this write so they never race ahead of the insert.
    const trafficEntryId = randomUUID();
    const trafficWrite = prisma.endpointTrafficEntry
      .create({
        data: {
          id: trafficEntryId,
          organizationId: endpoint.organizationId,
          endpointId: endpoint.id,
          requestMethod: req.method ?? "GET",
          requestPath: path,
          requestQuery: query,
          requestHeaders,
          requestBodyPreview: shouldCaptureBodies(endpoint.trafficCaptureMode)
            ? requestBodyCapture.preview
            : undefined,
          requestBodyBytes: requestBody.byteLength,
          requestTruncated: requestBodyCapture.truncated,
        },
      })
      .catch((err: unknown) => {
        console.error("[endpoint-proxy] failed to record traffic entry:", err);
        return null;
      });
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      this.pendingHttp.delete(requestId);
      if (!res.headersSent) res.writeHead(504);
      res.end("Endpoint proxy timed out");
      void trafficWrite
        .then((entry) =>
          entry
            ? prisma.endpointTrafficEntry.update({
                where: { id: trafficEntryId },
                data: {
                  completedAt: new Date(),
                  durationMs: Date.now() - startedAt,
                  error: "Proxy request timed out",
                },
              })
            : null,
        )
        .catch(() => {});
    }, endpointProxyRequestTimeoutMs());
    const pending: PendingHttp = {
      endpointId: endpoint.id,
      trafficEntryId,
      trafficWrite,
      startedAt,
      response: res,
      timer,
    };
    this.pendingHttp.set(requestId, pending);
    const delivery = sessionRouter.sendToRuntime(
      runtime.key,
      {
        type: "endpoint_http_request",
        requestId,
        endpointId: endpoint.id,
        processInstanceId: process.id,
        port: endpoint.targetPort,
        method: req.method ?? "GET",
        path: `${path}${query ? `?${query}` : ""}`,
        headers: forwardableRequestHeaders(req.headers),
        bodyBase64: requestBody.byteLength ? requestBody.toString("base64") : undefined,
      },
      endpoint.organizationId,
    );
    if (delivery !== "delivered") {
      clearTimeout(timer);
      this.pendingHttp.delete(requestId);
      res.writeHead(503).end(`Runtime not available: ${delivery}`);
    }
  }

  resolveHttpResponse(requestId: string, response: { status: number; headers: Record<string, string | string[]>; bodyBase64?: string }) {
    const pending = this.pendingHttp.get(requestId);
    if (!pending) return;
    this.pendingHttp.delete(requestId);
    clearTimeout(pending.timer);
    const body = response.bodyBase64 ? Buffer.from(response.bodyBase64, "base64") : Buffer.alloc(0);
    pending.response.writeHead(response.status, {
      ...forwardableResponseHeaders(response.headers),
      "X-Trace-Endpoint-Id": pending.endpointId,
    });
    pending.response.end(body);
    const capture = bodyPreview(body);
    void pending.trafficWrite
      .then((entry) =>
        entry
          ? prisma.endpointTrafficEntry.update({
              where: { id: pending.trafficEntryId },
              data: {
                completedAt: new Date(),
                durationMs: Date.now() - pending.startedAt,
                responseStatus: response.status,
                responseHeaders: sanitizeHeaders(response.headers),
                responseBodyPreview: capture.preview,
                responseBodyBytes: body.byteLength,
                responseTruncated: capture.truncated,
              },
            })
          : null,
      )
      .catch(() => {});
  }

  resolveHttpError(requestId: string, error: string) {
    const pending = this.pendingHttp.get(requestId);
    if (!pending) return;
    this.pendingHttp.delete(requestId);
    clearTimeout(pending.timer);
    pending.response.writeHead(502).end(error);
    void pending.trafficWrite
      .then((entry) =>
        entry
          ? prisma.endpointTrafficEntry.update({
              where: { id: pending.trafficEntryId },
              data: {
                completedAt: new Date(),
                durationMs: Date.now() - pending.startedAt,
                error,
              },
            })
          : null,
      )
      .catch(() => {});
  }

  handleWebSocketUpgrade(req: IncomingMessage, socket: Socket, head: Buffer) {
    const endpointKey = this.extractKey(req.headers.host);
    if (!endpointKey) {
      socket.destroy();
      return;
    }
    this.wsServer.handleUpgrade(req, socket, head, (client) => {
      void this.openWebSocket(endpointKey, req, client).catch(() => client.close());
    });
  }

  private async openWebSocket(endpointKey: string, req: IncomingMessage, client: WebSocket) {
    const endpoint = await prisma.sessionEndpoint.findUnique({ where: { key: endpointKey } });
    if (!endpoint || endpoint.status !== "enabled") {
      client.close();
      return;
    }
    if (endpoint.accessMode === "private") {
      const userId = authenticatedUserId(req);
      if (!userId) {
        client.close();
        return;
      }
      const group = await prisma.sessionGroup.findFirst({
        where: { id: endpoint.sessionGroupId, organizationId: endpoint.organizationId },
        select: { visibility: true, ownerUserId: true },
      });
      if (!group || !canViewSessionGroup(group, userId)) {
        client.close();
        return;
      }
    }
    const process = await prisma.sessionApplicationProcess.findUnique({
      where: {
        sessionGroupId_appConfigId_processConfigId: {
          sessionGroupId: endpoint.sessionGroupId,
          appConfigId: endpoint.appConfigId,
          processConfigId: endpoint.processConfigId,
        },
      },
    });
    if (!process?.runtimeInstanceId || process.status !== "running") {
      client.close();
      return;
    }
    const runtime = sessionRouter.getRuntime(process.runtimeInstanceId, endpoint.organizationId);
    if (!runtime || runtime.ws.readyState !== runtime.ws.OPEN) {
      client.close();
      return;
    }
    const requestId = randomUUID();
    this.pendingWs.set(requestId, { client, runtimeId: runtime.key, endpointId: endpoint.id });
    client.on("message", (data) => {
      const buffer = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data);
      sessionRouter.sendToRuntime(
        runtime.key,
        { type: "endpoint_ws_data", requestId, dataBase64: buffer.toString("base64") },
        endpoint.organizationId,
      );
    });
    client.on("close", (code, reason) => {
      this.pendingWs.delete(requestId);
      sessionRouter.sendToRuntime(
        runtime.key,
        {
          type: "endpoint_ws_close",
          requestId,
          code,
          reason: reason.toString("utf8"),
        },
        endpoint.organizationId,
      );
    });
    const { path, query } = requestPath(req);
    const delivery = sessionRouter.sendToRuntime(
      runtime.key,
      {
        type: "endpoint_ws_open",
        requestId,
        endpointId: endpoint.id,
        port: endpoint.targetPort,
        path: `${path}${query ? `?${query}` : ""}`,
        headers: forwardableRequestHeaders(req.headers, { websocket: true }),
      },
      endpoint.organizationId,
    );
    if (delivery !== "delivered") {
      this.pendingWs.delete(requestId);
      client.close();
    }
  }

  resolveWebSocketOpened(_requestId: string) {}

  resolveWebSocketData(requestId: string, dataBase64: string) {
    const pending = this.pendingWs.get(requestId);
    if (!pending) return;
    const data = Buffer.from(dataBase64, "base64");
    if (pending.client.readyState === pending.client.OPEN) pending.client.send(data);
  }

  resolveWebSocketClosed(requestId: string) {
    const pending = this.pendingWs.get(requestId);
    if (!pending) return;
    this.pendingWs.delete(requestId);
    pending.client.close();
  }
}

export const endpointProxyService = new EndpointProxyService();
