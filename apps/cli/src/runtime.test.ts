import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClientRuntime, type ConnectionState } from "./runtime.js";

function sessionStartedEvent(sessionId: string, index: number) {
  return {
    id: `evt-${index}`,
    scopeType: "session",
    scopeId: sessionId,
    eventType: "session_started",
    payload: {
      session: {
        id: sessionId,
        name: `Session ${index}`,
        sessionStatus: "active",
        updatedAt: `2026-01-01T00:00:0${index}.000Z`,
      },
    },
    actor: { type: "user", id: "user-1", name: "CLI Test", avatarUrl: null },
    parentId: null,
    timestamp: `2026-01-01T00:00:0${index}.000Z`,
    metadata: null,
  };
}

interface TestServer {
  url: string;
  close: () => Promise<void>;
  openSockets: () => number;
  connectionParams: Array<Record<string, unknown>>;
}

/** Minimal graphql-transport-ws server: ack the init, stream the fixture
 *  events on subscribe, stay open. Avoids pulling a second graphql realm. */
function startTestServer(events: Array<Record<string, unknown>>): Promise<TestServer> {
  const connectionParams: Array<Record<string, unknown>> = [];

  const httpServer: Server = createServer((req, res) => {
    if (req.url?.startsWith("/auth/me")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          user: {
            id: "user-1",
            email: "cli@test.local",
            name: "CLI Test",
            orgMemberships: [
              {
                organizationId: "org-1",
                role: "admin",
                joinedAt: "2026-01-01T00:00:00.000Z",
                organization: { id: "org-1", name: "Test Org" },
              },
            ],
          },
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    handleProtocols: (protocols) =>
      protocols.has("graphql-transport-ws") ? "graphql-transport-ws" : false,
  });

  wss.on("connection", (socket: WebSocket) => {
    socket.on("message", (raw) => {
      const message = JSON.parse(String(raw)) as {
        type: string;
        id?: string;
        payload?: Record<string, unknown>;
      };
      if (message.type === "connection_init") {
        connectionParams.push(message.payload ?? {});
        socket.send(JSON.stringify({ type: "connection_ack" }));
        return;
      }
      if (message.type === "ping") {
        socket.send(JSON.stringify({ type: "pong" }));
        return;
      }
      if (message.type === "subscribe") {
        for (const event of events) {
          socket.send(
            JSON.stringify({
              type: "next",
              id: message.id,
              payload: { data: { orgEvents: event } },
            }),
          );
        }
        // Real subscriptions stay open; never send `complete`.
      }
    });
  });

  return new Promise((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => {
      const { port } = httpServer.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        openSockets: () => wss.clients.size,
        connectionParams,
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

let configHome: string;

beforeEach(() => {
  configHome = mkdtempSync(join(tmpdir(), "trace-cli-runtime-"));
  process.env.XDG_CONFIG_HOME = configHome;
  process.env.TRACE_TOKEN = "test-token";
});

afterEach(() => {
  rmSync(configHome, { recursive: true, force: true });
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.TRACE_TOKEN;
});

describe("createClientRuntime", () => {
  it("hydrates auth, pipes orgEvents through handleOrgEvent, and disposes cleanly", async () => {
    const server = await startTestServer([
      sessionStartedEvent("session-1", 1),
      sessionStartedEvent("session-2", 2),
    ]);
    const states: ConnectionState[] = [];
    const runtime = createClientRuntime({
      serverUrl: server.url,
      onConnectionChange: (state) => states.push(state),
    });

    try {
      await runtime.start();

      const auth = runtime.stores.auth.getState();
      expect(auth.user?.id).toBe("user-1");
      expect(auth.activeOrgId).toBe("org-1");

      await waitFor(() => {
        const { sessions } = runtime.stores.entity.getState();
        return Boolean(sessions["session-1"] && sessions["session-2"]);
      });
      const { sessions } = runtime.stores.entity.getState();
      expect(sessions["session-1"]?.name).toBe("Session 1");
      // handleOrgEvent normalizes session_started to an in_progress status.
      expect(sessions["session-2"]?.sessionStatus).toBe("in_progress");
      expect(states).toContain("connected");

      // connectionParams flow through from client-core: token + org + source.
      expect(server.connectionParams[0]).toMatchObject({
        token: "test-token",
        organizationId: "org-1",
        clientSource: "cli",
      });

      await runtime.dispose();
      await waitFor(() => server.openSockets() === 0);
      expect(states.at(-1)).toBe("disconnected");
    } finally {
      await server.close();
    }
  });

  it("skips the subscription when started for one-shot queries", async () => {
    const server = await startTestServer([sessionStartedEvent("session-9", 9)]);
    const runtime = createClientRuntime({ serverUrl: server.url });

    try {
      await runtime.start({ orgEvents: false });
      expect(runtime.stores.auth.getState().user?.id).toBe("user-1");
      // No subscription — no WebSocket should ever open.
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(server.openSockets()).toBe(0);
      expect(runtime.stores.entity.getState().sessions["session-9"]).toBeUndefined();
      await runtime.dispose();
    } finally {
      await server.close();
    }
  });
});
