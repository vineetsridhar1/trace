import { GetObjectCommand, NoSuchKey, S3Client } from "@aws-sdk/client-s3";
import type { AppDeployment } from "@prisma/client";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { connect, type Socket } from "node:net";
import type { AppDeploymentSpec } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { forwardableRequestHeaders, forwardableResponseHeaders } from "./endpoint-utils.js";

const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const DEPLOYMENT_CACHE_TTL_MS = 2_000;
const MAX_DEPLOYMENT_CACHE_ENTRIES = 1_000;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function baseHost(): string | null {
  return process.env.TRACE_PUBLISHED_APP_BASE_HOST?.trim().toLowerCase() || null;
}

function staticBucket(): string {
  const bucket = process.env.TRACE_PUBLISHED_APP_BUCKET?.trim();
  if (!bucket) throw new Error("TRACE_PUBLISHED_APP_BUCKET is not configured");
  return bucket;
}

function serviceNamespace(): string {
  const namespace = process.env.TRACE_APP_SERVICE_DISCOVERY_NAMESPACE?.trim();
  if (!namespace) throw new Error("TRACE_APP_SERVICE_DISCOVERY_NAMESPACE is not configured");
  return namespace;
}

export function publishedAppRequestHeaders(headers: IncomingHttpHeaders): Headers {
  const forwarded = new Headers();
  for (const [name, raw] of Object.entries(forwardableRequestHeaders(headers))) {
    if (Array.isArray(raw)) raw.forEach((value) => forwarded.append(name, value));
    else forwarded.set(name, raw);
  }
  if (headers.host) {
    forwarded.set("x-forwarded-host", headers.host);
    const origin = forwarded.get("origin");
    try {
      if (origin && new URL(origin).origin === new URL(`https://${headers.host}`).origin) {
        forwarded.delete("origin");
      }
    } catch {
      // Preserve malformed or non-URL origins for the upstream application to reject.
    }
  }
  forwarded.set("x-forwarded-proto", "https");
  return forwarded;
}

async function requestBody(req: IncomingMessage): Promise<Uint8Array<ArrayBuffer> | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const value of req) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.byteLength;
    if (size > MAX_REQUEST_BYTES) throw new Error("Published app request body is too large");
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export function staticObjectPath(rawPath: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new Error("Invalid published app path");
  }
  const parts = decoded.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === ".." || part.includes("\\"))) {
    throw new Error("Invalid published app path");
  }
  return parts.join("/") || "index.html";
}

function deploymentSpec(value: unknown): AppDeploymentSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Published app deployment specification is invalid");
  }
  return value as AppDeploymentSpec;
}

function copyResponseHeaders(source: Headers, res: ServerResponse): void {
  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of source.entries()) headers[name] = value;
  const cookies = source.getSetCookie();
  if (cookies.length) headers["set-cookie"] = cookies;
  for (const [name, value] of Object.entries(forwardableResponseHeaders(headers))) {
    if (name.toLowerCase() === "content-encoding") continue;
    res.setHeader(name, value);
  }
}

function webSocketRequest(req: IncomingMessage): string {
  const forwarded = forwardableRequestHeaders(req.headers, { websocket: true });
  forwarded.host = req.headers.host ?? "";
  for (const name of [
    "connection",
    "upgrade",
    "sec-websocket-key",
    "sec-websocket-version",
    "sec-websocket-extensions",
    "sec-websocket-protocol",
  ]) {
    const value = req.headers[name];
    if (value !== undefined) forwarded[name] = value;
  }
  let request = `${req.method ?? "GET"} ${req.url ?? "/"} HTTP/${req.httpVersion}\r\n`;
  for (const [name, value] of Object.entries(forwarded)) {
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) request += `${name}: ${entry}\r\n`;
  }
  return `${request}\r\n`;
}

export class PublishedAppGateway {
  private readonly s3 = new S3Client({});
  private readonly deployments = new Map<
    string,
    { value: AppDeployment | null; expiresAt: number }
  >();

  extractSlug(hostHeader: string | undefined): string | null {
    const expected = baseHost();
    const host = hostHeader?.split(":")[0]?.toLowerCase();
    if (!expected || !host || !host.endsWith(`.${expected}`)) return null;
    const slug = host.slice(0, -1 * `.${expected}`.length);
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) ? slug : null;
  }

  async handle(req: IncomingMessage, res: ServerResponse, appSlug: string): Promise<void> {
    const deployment = await this.liveDeployment(appSlug);
    if (!deployment) {
      res.writeHead(404, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
      res.end("Published app not found");
      return;
    }
    try {
      if (deployment.target === "static") {
        await this.serveStatic(req, res, deployment.staticPrefix);
      } else {
        await this.proxyService(req, res, deployment.serviceName, deploymentSpec(deployment.spec));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Published app unavailable";
      if (res.headersSent) {
        res.destroy(error instanceof Error ? error : undefined);
        return;
      }
      res.writeHead(message.includes("too large") ? 413 : 502, {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
      });
      res.end(message);
    }
  }

  async handleWebSocketUpgrade(
    req: IncomingMessage,
    socket: Socket,
    head: Buffer,
    appSlug: string,
  ): Promise<void> {
    const reject = (status: number, message: string) => {
      socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    const deployment = await this.liveDeployment(appSlug);
    if (deployment?.target !== "service" || !deployment.serviceName) {
      reject(404, "Published app not found");
      return;
    }
    const spec = deploymentSpec(deployment.spec);
    if (!spec.port) {
      reject(502, "Published app unavailable");
      return;
    }
    const upstream = connect({
      host: `${deployment.serviceName}.${serviceNamespace()}`,
      port: spec.port,
    });
    let connected = false;
    const fail = () => {
      if (!socket.destroyed) {
        if (connected) socket.destroy();
        else reject(502, "Published app unavailable");
      }
      upstream.destroy();
    };
    upstream.setTimeout(REQUEST_TIMEOUT_MS, fail);
    upstream.once("error", fail);
    socket.once("error", () => upstream.destroy());
    upstream.once("connect", () => {
      connected = true;
      upstream.setTimeout(0);
      upstream.write(webSocketRequest(req));
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
  }

  private async serveStatic(
    req: IncomingMessage,
    res: ServerResponse,
    prefix: string | null,
  ): Promise<void> {
    if (!prefix) throw new Error("Static release is missing its artifact prefix");
    const url = new URL(req.url ?? "/", "https://published.invalid");
    const path = staticObjectPath(url.pathname);
    const load = async (objectPath: string) =>
      this.s3.send(
        new GetObjectCommand({ Bucket: staticBucket(), Key: `${prefix}/${objectPath}` }),
      );
    let object;
    let servedPath = path;
    try {
      object = await load(path);
    } catch (error) {
      if (
        (!(error instanceof NoSuchKey) &&
          (!(error instanceof Error) || error.name !== "NoSuchKey")) ||
        path === "index.html"
      ) {
        throw error;
      }
      object = await load("index.html");
      servedPath = "index.html";
    }
    if (!object.Body) throw new Error("Static release object has no body");
    if (object.ContentLength && object.ContentLength > MAX_RESPONSE_BYTES) {
      throw new Error("Published app response is too large");
    }
    res.writeHead(200, {
      "Content-Type": object.ContentType ?? "application/octet-stream",
      "Cache-Control": servedPath === "index.html" ? "no-cache" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    let size = 0;
    for await (const value of object.Body as AsyncIterable<Uint8Array>) {
      const chunk = Buffer.from(value);
      size += chunk.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error("Published app response is too large");
      res.write(chunk);
    }
    res.end();
  }

  private async proxyService(
    req: IncomingMessage,
    res: ServerResponse,
    serviceName: string | null,
    spec: AppDeploymentSpec,
  ): Promise<void> {
    if (!serviceName || !spec.port) throw new Error("Service release is missing runtime routing");
    const upstream = new URL(req.url ?? "/", `http://${serviceName}.${serviceNamespace()}`);
    upstream.port = String(spec.port);
    const response = await fetch(upstream, {
      method: req.method,
      headers: publishedAppRequestHeaders(req.headers),
      body: await requestBody(req),
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    copyResponseHeaders(response.headers, res);
    res.statusCode = response.status;
    if (req.method === "HEAD" || !response.body) {
      res.end();
      return;
    }
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        throw new Error("Published app response is too large");
      }
      res.write(chunk);
    }
    res.end();
  }

  private async liveDeployment(appSlug: string): Promise<AppDeployment | null> {
    const now = Date.now();
    const cached = this.deployments.get(appSlug);
    if (cached && cached.expiresAt > now) return cached.value;
    const deployment = await prisma.appDeployment.findFirst({
      where: { appSlug, status: "live" },
      orderBy: { completedAt: "desc" },
    });
    if (!this.deployments.has(appSlug) && this.deployments.size >= MAX_DEPLOYMENT_CACHE_ENTRIES) {
      const oldest = this.deployments.keys().next().value;
      if (oldest) this.deployments.delete(oldest);
    }
    this.deployments.delete(appSlug);
    this.deployments.set(appSlug, {
      value: deployment,
      expiresAt: now + DEPLOYMENT_CACHE_TTL_MS,
    });
    return deployment;
  }
}

export const publishedAppGateway = new PublishedAppGateway();
