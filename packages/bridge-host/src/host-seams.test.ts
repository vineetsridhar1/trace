import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocketServer } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setBridgeHostPaths } from "./host-paths.js";
import { getOrCreateInstanceId, readConfig } from "./config.js";
import { BridgeClient } from "./bridge.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bridge-host-test-"));
  setBridgeHostPaths({
    configPath: join(dir, "config.json"),
    stateDir: join(dir, "state"),
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("host paths injection", () => {
  it("routes the repo registry and instance ID through injected locations", () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({
        repos: { "repo-1": { path: "/tmp/repo-1", gitHooksEnabled: false, linkedCheckout: null } },
        bridgeLabel: "Test Host",
      }),
    );

    const config = readConfig();
    expect(Object.keys(config.repos)).toEqual(["repo-1"]);
    expect(config.bridgeLabel).toBe("Test Host");

    // Instance ID persists in the injected state dir and is stable.
    const first = getOrCreateInstanceId();
    expect(readFileSync(join(dir, "state", "instance-id"), "utf-8").trim()).toBe(first);
    expect(getOrCreateInstanceId()).toBe(first);
  });
});

interface TestBridgeServer {
  url: string;
  tokenRequests: Array<{ cookie: string | undefined; orgHeader: string | undefined }>;
  hello: () => Record<string, unknown> | null;
  wsTokens: string[];
  close: () => Promise<void>;
}

function startBridgeServer(): Promise<TestBridgeServer> {
  const tokenRequests: TestBridgeServer["tokenRequests"] = [];
  const wsTokens: string[] = [];
  let hello: Record<string, unknown> | null = null;

  const httpServer: Server = createServer((req, res) => {
    if (req.url?.startsWith("/auth/bridge-token")) {
      tokenRequests.push({
        cookie: req.headers.cookie,
        orgHeader: req.headers["x-organization-id"] as string | undefined,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          token: "bridge-token-1",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          localMode: true,
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/bridge" });
  wss.on("connection", (socket, request) => {
    const url = new URL(request.url ?? "", "http://localhost");
    wsTokens.push(url.searchParams.get("bridgeAuthToken") ?? "");
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as Record<string, unknown>;
      if (message.type === "runtime_hello") {
        hello = message;
      }
    });
  });

  return new Promise((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const { port } = httpServer.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        tokenRequests,
        wsTokens,
        hello: () => hello,
        close: () =>
          new Promise<void>((done) => {
            for (const socket of wss.clients) socket.terminate();
            wss.close(() => httpServer.close(() => done()));
          }),
      });
    });
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

describe("BridgeClient injection seams", () => {
  it("calls the auth provider on connect and announces the injected repo registry", async () => {
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({
        repos: { "repo-9": { path: "/tmp/repo-9", gitHooksEnabled: false, linkedCheckout: null } },
        bridgeLabel: "Seam Host",
      }),
    );

    const server = await startBridgeServer();
    const authProvider = vi.fn(async (url: string) => {
      expect(url).toContain("/auth/bridge-token");
      return "trace_token=jwt-from-host";
    });

    const client = new BridgeClient(server.url, authProvider);
    client.setAuthContext("org-1");

    try {
      await waitFor(() => server.hello() !== null);

      expect(authProvider).toHaveBeenCalled();
      expect(server.tokenRequests[0]).toEqual({
        cookie: "trace_token=jwt-from-host",
        orgHeader: "org-1",
      });
      expect(server.wsTokens).toEqual(["bridge-token-1"]);
      expect(server.hello()).toMatchObject({
        type: "runtime_hello",
        hostingMode: "local",
        label: "Seam Host",
        registeredRepoIds: ["repo-9"],
      });
      const instanceId = (server.hello() as { instanceId: string }).instanceId;
      expect(instanceId).toBe(getOrCreateInstanceId());
    } finally {
      client.disconnect();
      await server.close();
    }
  });
});
