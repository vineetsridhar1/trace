import { randomUUID } from "crypto";
import type { IncomingMessage, ServerResponse } from "http";
import type { Socket } from "net";
import { WebSocketServer, type WebSocket } from "ws";
import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { parseCookieToken, verifyToken } from "../lib/auth.js";
import { canViewSessionGroup } from "./access.js";
import {
  endpointPreviewCookieHeader,
  endpointPreviewTokenFromCookie,
  verifyEndpointPreviewToken,
} from "./endpoint-preview-auth.js";
import {
  bodyPreview,
  endpointProxyMaxRequestBodyBytes,
  endpointProxyMaxResponseBodyBytes,
  endpointProxyRequestTimeoutMs,
  extractEndpointKey,
  forwardableRequestHeaders,
  forwardableResponseHeaders,
  isAllowedPreviewRequestOrigin,
  isAttachmentResponse,
  sanitizeHeaders,
  shouldCaptureBodies,
  shouldCaptureHeaders,
  webSocketProtocols,
} from "./endpoint-utils.js";

// The Trace app is the only legitimate embedder of a private preview iframe, so
// the injected overlay posts there rather than to any parent ("*").
const TRACE_APP_ORIGIN = (() => {
  try {
    return process.env.TRACE_WEB_URL ? new URL(process.env.TRACE_WEB_URL).origin : "*";
  } catch {
    return "*";
  }
})();

type PendingHttp = {
  endpointId: string;
  trafficEntryId: string;
  trafficWrite: Promise<unknown>;
  startedAt: number;
  response: ServerResponse;
  timer: ReturnType<typeof setTimeout>;
  injectAuthoringOverlay: boolean;
};

type PendingWs = {
  client: WebSocket;
  runtimeId: string;
  endpointId: string;
};

function requestPath(req: IncomingMessage): { path: string; query: string | null } {
  const raw = req.url ?? "/";
  // Split on the FIRST "?" only — a literal "?" is legal inside a query string
  // (RFC 3986), so `split("?", 2)` would silently drop everything after it.
  const i = raw.indexOf("?");
  const path = i === -1 ? raw : raw.slice(0, i);
  const query = i === -1 ? null : raw.slice(i + 1);
  return { path: path || "/", query };
}

function authenticatedUserId(req: IncomingMessage): string | null {
  const cookieToken = parseCookieToken(req.headers.cookie);
  return cookieToken ? verifyToken(cookieToken) : null;
}

function endpointPreviewUserId(
  req: IncomingMessage,
  endpoint: { id: string; organizationId: string },
): string | null {
  const token = endpointPreviewTokenFromCookie(req.headers.cookie);
  const payload = token ? verifyEndpointPreviewToken(token) : null;
  return payload?.endpointId === endpoint.id && payload.organizationId === endpoint.organizationId
    ? payload.userId
    : null;
}

// Private preview access requires the caller to (1) resolve to a user via a
// Trace session cookie or an endpoint-preview cookie, (2) be a member of the
// endpoint's org, and (3) be able to view the backing session group. The plain
// session cookie authenticates a user across ANY org, so the org-membership
// check is essential: without it a user from another org holding the endpoint
// key could reach a private preview (the group's default visibility is public).
async function authorizePrivateAccess(
  req: IncomingMessage,
  endpoint: { id: string; organizationId: string; sessionGroupId: string },
): Promise<boolean> {
  const userId = authenticatedUserId(req) ?? endpointPreviewUserId(req, endpoint);
  if (!userId) return false;
  const membership = await prisma.orgMember.findUnique({
    where: { userId_organizationId: { userId, organizationId: endpoint.organizationId } },
    select: { userId: true },
  });
  if (!membership) return false;
  const group = await prisma.sessionGroup.findFirst({
    where: { id: endpoint.sessionGroupId, organizationId: endpoint.organizationId },
    select: { visibility: true, ownerUserId: true },
  });
  return !!group && canViewSessionGroup(group, userId);
}

function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", "http://trace-endpoint.local");
}

function safeRedirectPath(value: string | null): string {
  // Must be a same-origin absolute path. Reject protocol-relative (`//host`) and
  // backslash variants (`/\host`, which browsers normalize to `//host`).
  if (!value || !value.startsWith("/")) return "/";
  if (value[1] === "/" || value[1] === "\\") return "/";
  return value;
}

function injectAuthoringOverlay(
  headers: Record<string, string | string[]>,
  body: Buffer,
): { headers: Record<string, string | string[]>; body: Buffer } {
  const contentType = headers["content-type"] ?? headers["Content-Type"];
  const encoding = headers["content-encoding"] ?? headers["Content-Encoding"];
  if (
    encoding ||
    isAttachmentResponse(headers) ||
    typeof contentType !== "string" ||
    !/\btext\/html\b/i.test(contentType)
  ) {
    return { headers, body };
  }
  const html = body.toString("utf8");
  if (html.includes("data-trace-app-overlay")) return { headers, body };
  const script = `<script data-trace-app-overlay>(function(){
var TRACE_ORIGIN=${JSON.stringify(TRACE_APP_ORIGIN)};
try{if(TRACE_ORIGIN==="*"&&document.referrer)TRACE_ORIGIN=new URL(document.referrer).origin}catch(e){}
var editEnabled=false;
var selectedId=null;
var hoverEl=null;
function post(event,payload){if(TRACE_ORIGIN!=="*"&&window.parent&&window.parent!==window)window.parent.postMessage({type:"trace:app:overlay",event:event,...payload},TRACE_ORIGIN)}
function closestSourceTarget(value){return value&&value.closest&&value.closest("[data-trace-source]")}
function closestEditTarget(value){return value&&value.closest&&value.closest("[data-trace-id][data-trace-source]")}
function findEditTarget(elementId){
  var elements=document.querySelectorAll("[data-trace-id]");
  for(var i=0;i<elements.length;i++)if(elements[i].getAttribute("data-trace-id")===elementId)return elements[i];
  return null;
}
function clearHover(){if(hoverEl){hoverEl.removeAttribute("data-trace-edit-hover");hoverEl=null}}
function clearSelection(){selectedId=null;restoreSelection()}
function restoreSelection(){
  var selected=document.querySelectorAll("[data-trace-edit-selected]");
  for(var i=0;i<selected.length;i++)selected[i].removeAttribute("data-trace-edit-selected");
  if(!selectedId)return;
  var el=findEditTarget(selectedId);
  if(el)el.setAttribute("data-trace-edit-selected","");
}
function setEditMode(enabled){
  editEnabled=!!enabled;
  document.documentElement.toggleAttribute("data-trace-edit-mode",editEnabled);
  if(!editEnabled){clearHover();clearSelection()}
}
function selectedPayload(el){
  var text=(el.textContent||"").trim().slice(0,2000);
  return {sourceLocation:el.getAttribute("data-trace-source"),elementId:el.getAttribute("data-trace-id"),text:text,editableText:el.children.length===0};
}
document.addEventListener("pointerover",function(e){
  if(!editEnabled)return;
  var el=closestEditTarget(e.target);
  if(el===hoverEl)return;
  clearHover();
  if(el){hoverEl=el;el.setAttribute("data-trace-edit-hover","")}
},true);
document.addEventListener("pointerout",function(e){
  if(!editEnabled||!hoverEl)return;
  var next=e.relatedTarget;
  if(next&&hoverEl.contains(next))return;
  clearHover();
},true);
document.addEventListener("click",function(e){
  var el=editEnabled?closestEditTarget(e.target):closestSourceTarget(e.target);
  if(!el)return;
  if(editEnabled){
    e.preventDefault();e.stopPropagation();
    selectedId=el.getAttribute("data-trace-id");
    restoreSelection();
    post("element-selected",selectedPayload(el));
    return;
  }
  post("element-selected",{sourceLocation:el.getAttribute("data-trace-source"),text:(el.textContent||"").trim().slice(0,500)});
},true);
window.addEventListener("message",function(e){
  if(e.source!==window.parent||TRACE_ORIGIN==="*"||e.origin!==TRACE_ORIGIN||!e.data)return;
  if(e.data.type==="trace:design:edit-mode"){setEditMode(e.data.enabled);return}
  if(e.data.type==="trace:design:clear-selection"){clearSelection();return}
  if(e.data.type==="trace:design:preview-text"&&typeof e.data.elementId==="string"&&typeof e.data.text==="string"){
    var el=findEditTarget(e.data.elementId);
    if(el&&el.children.length===0)el.textContent=e.data.text;
  }
});
var style=document.createElement("style");
style.setAttribute("data-trace-app-overlay-style","");
style.textContent='html[data-trace-edit-mode] [data-trace-id][data-trace-source]{cursor:text!important}html[data-trace-edit-mode] [data-trace-edit-hover]{outline:1px dashed #3b82f6!important;outline-offset:2px!important}html[data-trace-edit-mode] [data-trace-edit-selected]{outline:2px solid #3b82f6!important;outline-offset:2px!important}';
document.head.appendChild(style);
var root=document.getElementById("root")||document.body;
if(window.MutationObserver&&root)new MutationObserver(function(){restoreSelection()}).observe(root,{childList:true,subtree:true});
post("ready",{});
window.addEventListener("error",function(e){post("error",{message:e.message||"Application script error",stack:e.error&&e.error.stack?String(e.error.stack):null})});
})();</script>`;
  const nextBody = Buffer.from(
    /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${script}</body>`) : `${html}${script}`,
  );
  const nextHeaders = { ...headers };
  delete nextHeaders["content-length"];
  delete nextHeaders["Content-Length"];
  // Intentionally drop the app's CSP so the injected inline overlay script runs.
  // This only affects private previews (an isolated origin serving the org's own
  // in-development app), so it weakens that untrusted app's own defense-in-depth
  // rather than any Trace-origin protection.
  delete nextHeaders["content-security-policy"];
  delete nextHeaders["Content-Security-Policy"];
  return { headers: nextHeaders, body: nextBody };
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
  private wsServer = new WebSocketServer({
    noServer: true,
    maxPayload: endpointProxyMaxRequestBodyBytes(),
  });

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
    if (requestUrl(req).pathname === "/__trace_preview_auth") {
      await this.handlePreviewAuth(req, res, endpoint);
      return;
    }
    if (endpoint.status !== "enabled") {
      res.writeHead(503).end("Endpoint unavailable");
      return;
    }
    if (endpoint.accessMode === "private") {
      // The preview cookie is SameSite=None, so a credentialed request can be
      // driven cross-site (CSRF). Reject any browser Origin that isn't the app's
      // own preview origin or a Trace app origin.
      if (!isAllowedPreviewRequestOrigin(req.headers.origin, endpointKey)) {
        res.writeHead(403).end("Cross-origin request forbidden");
        return;
      }
      if (!(await authorizePrivateAccess(req, endpoint))) {
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
      injectAuthoringOverlay: endpoint.accessMode === "private",
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

  resolveHttpResponse(
    requestId: string,
    response: { status: number; headers: Record<string, string | string[]>; bodyBase64?: string },
  ) {
    const pending = this.pendingHttp.get(requestId);
    if (!pending) return;
    this.pendingHttp.delete(requestId);
    clearTimeout(pending.timer);
    let body: Buffer<ArrayBufferLike> = response.bodyBase64
      ? Buffer.from(response.bodyBase64, "base64")
      : Buffer.alloc(0);
    // The runtime hosts untrusted app code; cap the relayed response so a huge
    // body can't OOM the proxy. (Streaming large/SSE responses is a separate
    // enhancement; this bounds the single-shot buffer.)
    const maxResponseBytes = endpointProxyMaxResponseBodyBytes();
    if (body.byteLength > maxResponseBytes) {
      pending.response.writeHead(502, {
        "X-Trace-Endpoint-Id": pending.endpointId,
        "Content-Type": "text/plain",
      });
      pending.response.end("Response body too large");
      void pending.trafficWrite
        .then((entry) =>
          entry
            ? prisma.endpointTrafficEntry.update({
                where: { id: pending.trafficEntryId },
                data: {
                  completedAt: new Date(),
                  durationMs: Date.now() - pending.startedAt,
                  responseStatus: 502,
                  error: "Response body too large",
                  responseBodyBytes: body.byteLength,
                },
              })
            : null,
        )
        .catch(() => {});
      return;
    }
    let headers = forwardableResponseHeaders(response.headers);
    if (pending.injectAuthoringOverlay) {
      const injected = injectAuthoringOverlay(headers, body);
      headers = injected.headers;
      body = injected.body;
    }
    pending.response.writeHead(response.status, {
      ...headers,
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
      // Guard against Cross-Site WebSocket Hijacking: the SameSite=None preview
      // cookie rides cross-site upgrades, so require a same-endpoint or Trace
      // Origin before honoring the credentialed connection.
      if (!isAllowedPreviewRequestOrigin(req.headers.origin, endpointKey)) {
        client.close(1008, "Cross-origin request forbidden");
        return;
      }
      if (!(await authorizePrivateAccess(req, endpoint))) {
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
    client.on("message", (data, isBinary) => {
      const buffer = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data);
      sessionRouter.sendToRuntime(
        runtime.key,
        {
          type: "endpoint_ws_data",
          requestId,
          dataBase64: buffer.toString("base64"),
          isBinary,
        },
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
        protocols: webSocketProtocols(req.headers),
      },
      endpoint.organizationId,
    );
    if (delivery !== "delivered") {
      this.pendingWs.delete(requestId);
      client.close();
    }
  }

  resolveWebSocketOpened(_requestId: string) {}

  private async handlePreviewAuth(
    req: IncomingMessage,
    res: ServerResponse,
    endpoint: { id: string; organizationId: string; sessionGroupId: string },
  ) {
    const url = requestUrl(req);
    const token = url.searchParams.get("token");
    const payload = token ? verifyEndpointPreviewToken(token) : null;
    if (
      !payload ||
      payload.endpointId !== endpoint.id ||
      payload.organizationId !== endpoint.organizationId
    ) {
      res.writeHead(401).end("Invalid endpoint preview token");
      return;
    }
    const group = await prisma.sessionGroup.findFirst({
      where: { id: endpoint.sessionGroupId, organizationId: endpoint.organizationId },
      select: { visibility: true, ownerUserId: true },
    });
    if (!group || !canViewSessionGroup(group, payload.userId)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const expiresAt = payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 60_000);
    res.writeHead(302, {
      "Set-Cookie": endpointPreviewCookieHeader(token ?? "", expiresAt),
      Location: safeRedirectPath(url.searchParams.get("next")),
      "Cache-Control": "no-store",
    });
    res.end();
  }

  resolveWebSocketData(requestId: string, dataBase64: string, isBinary = true) {
    const pending = this.pendingWs.get(requestId);
    if (!pending) return;
    const data = Buffer.from(dataBase64, "base64");
    if (pending.client.readyState === pending.client.OPEN) {
      pending.client.send(isBinary ? data : data.toString("utf8"), { binary: isBinary });
    }
  }

  resolveWebSocketClosed(requestId: string) {
    const pending = this.pendingWs.get(requestId);
    if (!pending) return;
    this.pendingWs.delete(requestId);
    pending.client.close();
  }
}

export const endpointProxyService = new EndpointProxyService();
