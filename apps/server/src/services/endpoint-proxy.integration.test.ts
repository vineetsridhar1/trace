import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { promisify } from "node:util";
import { TRACE_APP_STARTER_FILES } from "@trace/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/session-router.js", () => ({
  sessionRouter: {
    getRuntime: vi.fn(),
    sendToRuntime: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { sessionRouter } from "../lib/session-router.js";
import { EndpointProxyService } from "./endpoint-proxy.js";

const execFileAsync = promisify(execFile);
const runProxyStarterSmoke = process.env.TRACE_RUN_APP_STARTER_PROXY_SMOKE === "1";
const runIfEnabled = runProxyStarterSmoke ? it : it.skip;

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const sessionRouterMock = sessionRouter as unknown as {
  getRuntime: ReturnType<typeof vi.fn>;
  sendToRuntime: ReturnType<typeof vi.fn>;
};

type RecordedResponse = ServerResponse & {
  statusCodeValue: number | null;
  headersValue: Record<string, string | string[]>;
  bodyValue: Buffer;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function allocatePort() {
  return new Promise<string>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(String(address.port));
        } else {
          reject(new Error("Could not allocate a local smoke port"));
        }
      });
    });
  });
}

async function writeStarterFiles(workdir: string) {
  for (const [filePath, contents] of Object.entries(TRACE_APP_STARTER_FILES)) {
    const absolutePath = path.join(workdir, filePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents, "utf8");
  }
}

async function waitForHttp(url: string, child: ChildProcessWithoutNullStreams) {
  const deadline = Date.now() + 60_000;
  let lastError: Error | null = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`dev server exited before ${url} was ready`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await wait(500);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "no response"}`);
}

async function startGeneratedStarter(workdir: string, port: string) {
  await writeStarterFiles(workdir);
  await execFileAsync("pnpm", ["install", "--ignore-scripts"], {
    cwd: workdir,
    env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" },
    maxBuffer: 20 * 1024 * 1024,
  });

  const child = spawn("pnpm", ["dev", "--hostname", "127.0.0.1", "--port", port], {
    cwd: workdir,
    env: { ...process.env, CI: "1", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.resume();
  child.stderr.resume();
  await waitForHttp(`http://127.0.0.1:${port}/`, child);
  return child;
}

function makeRequest(url: string): IncomingMessage {
  const req = new PassThrough() as IncomingMessage;
  req.url = url;
  req.method = "GET";
  req.headers = {};
  req.end();
  return req;
}

function makeResponse(): RecordedResponse {
  const recorder = {
    statusCodeValue: null as number | null,
    headersValue: {} as Record<string, string | string[]>,
    bodyValue: Buffer.alloc(0),
    headersSent: false,
    writeHead(statusCode: number, headers?: Record<string, string | string[]>) {
      this.statusCodeValue = statusCode;
      this.headersValue = headers ?? {};
      this.headersSent = true;
      return this;
    },
    end(chunk?: string | Buffer) {
      if (Buffer.isBuffer(chunk)) {
        this.bodyValue = Buffer.concat([this.bodyValue, chunk]);
      } else if (typeof chunk === "string") {
        this.bodyValue = Buffer.concat([this.bodyValue, Buffer.from(chunk)]);
      }
      this.headersSent = true;
      return this;
    },
  };
  return recorder as unknown as RecordedResponse;
}

async function proxyGet(service: EndpointProxyService, targetBaseUrl: string, url: string) {
  const res = makeResponse();
  await service.handleHttpRequest(makeRequest(url), res, "endpointkey1");
  const command = sessionRouterMock.sendToRuntime.mock.calls.at(-1)?.[1] as
    | { requestId?: string; path?: string; port?: number; type?: string }
    | undefined;
  expect(command).toMatchObject({
    type: "endpoint_http_request",
    endpointId: "endpoint-1",
    port: 3000,
  });
  if (!command?.requestId || !command.path) {
    throw new Error("Endpoint proxy command did not include a request id and path");
  }

  const upstream = await fetch(`${targetBaseUrl}${command.path}`);
  const body = Buffer.from(await upstream.arrayBuffer());
  service.resolveHttpResponse(command.requestId, {
    status: upstream.status,
    headers: Object.fromEntries(upstream.headers.entries()),
    bodyBase64: body.toString("base64"),
  });
  return res;
}

describe("EndpointProxyService generated app starter smoke", () => {
  let workdir: string | null = null;
  let child: ChildProcessWithoutNullStreams | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.sessionEndpoint.findUnique.mockResolvedValue({
      id: "endpoint-1",
      key: "endpointkey1",
      organizationId: "org-1",
      sessionGroupId: "group-1",
      appConfigId: "web",
      processConfigId: "dev",
      portConfigId: "web",
      status: "enabled",
      accessMode: "public",
      trafficCaptureMode: "metadata",
      targetPort: 3000,
      expiresAt: null,
      revokedAt: null,
    });
    prismaMock.sessionApplicationProcess.findUnique.mockResolvedValue({
      id: "process-1",
      status: "running",
      runtimeInstanceId: "runtime-1",
    });
    prismaMock.endpointTrafficEntry.create.mockResolvedValue({ id: "traffic-1" });
    prismaMock.endpointTrafficEntry.update.mockResolvedValue({ id: "traffic-1" });
    sessionRouterMock.getRuntime.mockReturnValue({
      key: "runtime-1",
      ws: { readyState: 1, OPEN: 1 },
    });
    sessionRouterMock.sendToRuntime.mockReturnValue("delivered");
  });

  afterEach(async () => {
    child?.kill("SIGTERM");
    if (child) {
      await Promise.race([
        new Promise((resolve) => child?.once("exit", resolve)),
        wait(5_000).then(() => child?.kill("SIGKILL")),
      ]);
    }
    child = null;
    if (workdir) {
      await fs.rm(workdir, { recursive: true, force: true });
    }
    workdir = null;
  });

  runIfEnabled(
    "proxies the generated Next.js starter page and API route through the endpoint proxy",
    async () => {
      workdir = await fs.mkdtemp(path.join(os.tmpdir(), "trace-endpoint-starter-"));
      const port = await allocatePort();
      child = await startGeneratedStarter(workdir, port);
      const targetBaseUrl = `http://127.0.0.1:${port}`;
      const service = new EndpointProxyService();

      const page = await proxyGet(service, targetBaseUrl, "/");
      const html = page.bodyValue.toString("utf8");
      expect(page.statusCodeValue).toBe(200);
      expect(html).toContain("Trace app session");
      expect(html).toContain("Build the full-stack app from here.");
      expect(html).toContain("data-trace-source");
      expect(html).not.toContain("data-trace-app-overlay");

      const api = await proxyGet(service, targetBaseUrl, "/api/items");
      const payload = JSON.parse(api.bodyValue.toString("utf8")) as { items?: unknown[] };
      expect(api.statusCodeValue).toBe(200);
      expect(Array.isArray(payload.items)).toBe(true);
      expect(payload.items?.length).toBeGreaterThan(0);
    },
    120_000,
  );
});
