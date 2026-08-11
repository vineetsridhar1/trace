import { GetObjectCommand, NoSuchKey, S3Client } from "@aws-sdk/client-s3";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { connect, type Socket } from "node:net";
import type { AppDeploymentSpec } from "@trace/shared";
import { prisma } from "../lib/db.js";

const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
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

function requestHeaders(headers: IncomingHttpHeaders): Headers {
  const forwarded = new Headers();
  for (const [name, raw] of Object.entries(headers)) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase()) || raw === undefined) continue;
    if (Array.isArray(raw)) raw.forEach((value) => forwarded.append(name, value));
    else forwarded.set(name, raw);
  }
  if (headers.host) forwarded.set("x-forwarded-host", headers.host);
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
  for (const [name, value] of source.entries()) {
    if (
      HOP_BY_HOP_HEADERS.has(name.toLowerCase()) ||
      name.toLowerCase() === "content-encoding" ||
      name.toLowerCase() === "set-cookie"
    ) {
      continue;
    }
    res.setHeader(name, value);
  }
  const cookies = source.getSetCookie();
  if (cookies.length) res.setHeader("set-cookie", cookies);
}

export class PublishedAppGateway {
  private readonly s3 = new S3Client({});

  extractSlug(hostHeader: string | undefined): string | null {
    const expected = baseHost();
    const host = hostHeader?.split(":")[0]?.toLowerCase();
    if (!expected || !host || !host.endsWith(`.${expected}`)) return null;
    const slug = host.slice(0, -1 * `.${expected}`.length);
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) ? slug : null;
  }

  async handle(req: IncomingMessage, res: ServerResponse, appSlug: string): Promise<void> {
    const deployment = await prisma.appDeployment.findFirst({
      where: { appSlug, status: "live" },
      orderBy: { completedAt: "desc" },
    });
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
    const deployment = await prisma.appDeployment.findFirst({
      where: { appSlug, status: "live", target: "service" },
      orderBy: { completedAt: "desc" },
    });
    if (!deployment?.serviceName) {
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
      let request = `${req.method ?? "GET"} ${req.url ?? "/"} HTTP/${req.httpVersion}\r\n`;
      for (let index = 0; index < req.rawHeaders.length; index += 2) {
        request += `${req.rawHeaders[index]}: ${req.rawHeaders[index + 1]}\r\n`;
      }
      upstream.write(`${request}\r\n`);
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
    const body = Buffer.from(await object.Body.transformToByteArray());
    res.writeHead(200, {
      "Content-Type": object.ContentType ?? "application/octet-stream",
      "Cache-Control": servedPath === "index.html" ? "no-cache" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : body);
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
      headers: requestHeaders(req.headers),
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
}

export const publishedAppGateway = new PublishedAppGateway();
