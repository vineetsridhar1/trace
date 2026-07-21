import http from "http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BridgeMessage } from "@trace/shared";
import { WebSocketServer } from "ws";
import { ManagedProcessManager } from "./managed-process-manager.js";

function waitFor(
  messages: BridgeMessage[],
  predicate: (message: BridgeMessage) => boolean,
  timeoutMs = 3000,
) {
  return new Promise<BridgeMessage>((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const match = messages.find(predicate);
      if (match) {
        clearInterval(timer);
        resolve(match);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for bridge message"));
      }
    }, 10);
  });
}

function waitForCount(
  messages: BridgeMessage[],
  predicate: (message: BridgeMessage) => boolean,
  count: number,
) {
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (messages.filter(predicate).length >= count) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > 5000) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for ${count} bridge messages`));
      }
    }, 10);
  });
}

async function getFreePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing free port");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function waitForHttp(port: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 3000) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get({ host: "127.0.0.1", port, path: "/" }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(100, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for port ${port}`);
}

async function waitForPortAvailable(port: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const available = await new Promise<boolean>((resolve) => {
      const server = http.createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => {
        server.close(() => resolve(true));
      });
    });
    if (available) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for port ${port} to be available`);
}

describe("ManagedProcessManager", () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
    servers.length = 0;
  });

  it("runs setup scripts and returns output", async () => {
    const messages: BridgeMessage[] = [];
    const manager = new ManagedProcessManager(new Map([["session-1", process.cwd()]]), (message) =>
      messages.push(message),
    );

    manager.runSetupScript({
      requestId: "setup-1",
      sessionId: "session-1",
      command: "printf setup-ok",
      cwd: ".",
    });

    await waitFor(
      messages,
      (message) => message.type === "setup_script_log" && message.data.includes("setup-ok"),
    );
    const result = await waitFor(messages, (message) => message.type === "setup_script_result");
    expect(result).toMatchObject({
      type: "setup_script_result",
      requestId: "setup-1",
      exitCode: 0,
    });
    expect(result.type === "setup_script_result" ? result.output : "").toContain(
      "[trace] Running setup script",
    );
    expect(result.type === "setup_script_result" ? result.output : "").toContain("setup-ok");
  });

  it("starts a managed process, captures logs, and reports exit", async () => {
    const messages: BridgeMessage[] = [];
    const manager = new ManagedProcessManager(new Map([["session-1", process.cwd()]]), (message) =>
      messages.push(message),
    );

    manager.start({
      requestId: "start-1",
      processInstanceId: "process-1",
      sessionGroupId: "group-1",
      sessionId: "session-1",
      command: "printf process-ok",
      cwd: ".",
    });

    await waitFor(messages, (message) => message.type === "app_process_started");
    await waitFor(
      messages,
      (message) => message.type === "app_process_log" && message.data.includes("process-ok"),
    );
    const exit = await waitFor(messages, (message) => message.type === "app_process_exited");
    expect(exit).toMatchObject({ type: "app_process_exited", processInstanceId: "process-1" });
  });

  it("stops the full process tree so ports can be reused", async () => {
    const messages: BridgeMessage[] = [];
    const manager = new ManagedProcessManager(new Map([["session-1", process.cwd()]]), (message) =>
      messages.push(message),
    );
    const port = await getFreePort();

    manager.start({
      requestId: "start-1",
      processInstanceId: "process-1",
      sessionGroupId: "group-1",
      sessionId: "session-1",
      command: `node -e "require('http').createServer((req,res)=>res.end('ok')).listen(${port}, '127.0.0.1')"`,
      cwd: ".",
      ports: [port],
    });

    await waitFor(messages, (message) => message.type === "app_process_started");
    await waitForHttp(port);
    manager.stop("process-1");
    await waitFor(messages, (message) => message.type === "app_process_exited");
    await waitForPortAvailable(port);
  });

  it("restarts a preview process after an unexpected exit", async () => {
    const messages: BridgeMessage[] = [];
    const manager = new ManagedProcessManager(new Map([["session-1", process.cwd()]]), (message) =>
      messages.push(message),
    );
    const port = await getFreePort();

    manager.start({
      requestId: "start-1",
      processInstanceId: "process-1",
      sessionGroupId: "group-1",
      sessionId: "session-1",
      command: `node -e "const http=require('http');const s=http.createServer((req,res)=>res.end('ok')).listen(${port},'127.0.0.1');setTimeout(()=>s.close(()=>process.exit(1)),600)"`,
      cwd: ".",
      ports: [port],
    });

    await waitForCount(messages, (message) => message.type === "app_process_started", 2);
    expect(
      messages.some(
        (message) =>
          message.type === "app_process_log" && message.data.includes("restarting in 500ms"),
      ),
    ).toBe(true);
    expect(messages.some((message) => message.type === "app_process_exited")).toBe(false);

    manager.stop("process-1");
    await waitFor(messages, (message) => message.type === "app_process_exited");
    await waitForPortAvailable(port);
  });

  it("reports a preview failure after exhausting automatic restarts", async () => {
    const messages: BridgeMessage[] = [];
    const manager = new ManagedProcessManager(new Map([["session-1", process.cwd()]]), (message) =>
      messages.push(message),
    );
    const port = await getFreePort();

    manager.start({
      requestId: "start-1",
      processInstanceId: "process-1",
      sessionGroupId: "group-1",
      sessionId: "session-1",
      command: 'node -e "process.exit(1)"',
      cwd: ".",
      ports: [port],
    });

    const failure = await waitFor(
      messages,
      (message) => message.type === "app_process_error",
      6_000,
    );
    expect(failure).toMatchObject({
      type: "app_process_error",
      processInstanceId: "process-1",
      error: expect.stringContaining("3 automatic restart attempts"),
    });
    expect(
      messages.filter(
        (message) => message.type === "app_process_log" && message.data.includes("restarting in"),
      ),
    ).toHaveLength(3);
    expect(messages.some((message) => message.type === "app_process_exited")).toBe(false);
  });

  it("cancels an automatic restart when Trace stops the process", async () => {
    const messages: BridgeMessage[] = [];
    const manager = new ManagedProcessManager(new Map([["session-1", process.cwd()]]), (message) =>
      messages.push(message),
    );
    const port = await getFreePort();

    manager.start({
      requestId: "start-1",
      processInstanceId: "process-1",
      sessionGroupId: "group-1",
      sessionId: "session-1",
      command: `node -e "const http=require('http');const s=http.createServer((req,res)=>res.end('ok')).listen(${port},'127.0.0.1');setTimeout(()=>s.close(()=>process.exit(1)),400)"`,
      cwd: ".",
      ports: [port],
    });

    await waitFor(
      messages,
      (message) => message.type === "app_process_log" && message.data.includes("restarting in"),
    );
    manager.stop("process-1");
    await new Promise((resolve) => setTimeout(resolve, 700));

    expect(messages.filter((message) => message.type === "app_process_started")).toHaveLength(1);
    await waitForPortAvailable(port);
  });

  it("restart reuses the process id without the old child clobbering the new one", async () => {
    const messages: BridgeMessage[] = [];
    const manager = new ManagedProcessManager(new Map([["session-1", process.cwd()]]), (message) =>
      messages.push(message),
    );
    const port = await getFreePort();
    const startProcess = () =>
      manager.start({
        requestId: "start-1",
        processInstanceId: "process-1",
        sessionGroupId: "group-1",
        sessionId: "session-1",
        command: `node -e "require('http').createServer((req,res)=>res.end('ok')).listen(${port}, '127.0.0.1')"`,
        cwd: ".",
        ports: [port],
      });

    startProcess();
    await waitFor(messages, (message) => message.type === "app_process_started");
    await waitForHttp(port);

    // Restart under the same processInstanceId. The old child is terminated
    // before the new one spawns; its exit must not be reported (it would mark
    // the freshly started process as exited on the server).
    messages.length = 0;
    startProcess();
    await waitFor(messages, (message) => message.type === "app_process_started");
    await waitForHttp(port);
    expect(messages.some((message) => message.type === "app_process_exited")).toBe(false);

    manager.stop("process-1");
    await waitFor(messages, (message) => message.type === "app_process_exited");
    await waitForPortAvailable(port);
  });

  it("proxies HTTP requests to localhost ports", async () => {
    const messages: BridgeMessage[] = [];
    const manager = new ManagedProcessManager(new Map(), (message) => messages.push(message));
    const server = http.createServer((req, res) => {
      res.writeHead(201, { "x-test": "ok" });
      res.end(`proxied ${req.method} ${req.url}`);
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");

    manager.proxyHttp({
      requestId: "http-1",
      port: address.port,
      method: "GET",
      path: "/hello",
      headers: {},
    });

    const response = await waitFor(
      messages,
      (message) => message.type === "endpoint_http_response",
    );
    expect(response).toMatchObject({
      type: "endpoint_http_response",
      requestId: "http-1",
      status: 201,
    });
    if (response.type !== "endpoint_http_response" || !response.bodyBase64) {
      throw new Error("Missing HTTP proxy body");
    }
    expect(Buffer.from(response.bodyBase64, "base64").toString("utf8")).toBe("proxied GET /hello");
  });

  it("retries safe requests while a watched dev server restarts", async () => {
    const messages: BridgeMessage[] = [];
    const manager = new ManagedProcessManager(new Map(), (message) => messages.push(message));
    const port = await getFreePort();
    const server = http.createServer((_req, res) => res.end("restarted"));
    servers.push(server);

    manager.proxyHttp({
      requestId: "http-restart",
      port,
      method: "GET",
      path: "/",
      headers: {},
    });
    setTimeout(() => server.listen(port, "127.0.0.1"), 150);

    const response = await waitFor(
      messages,
      (message) => message.type === "endpoint_http_response",
    );
    expect(response).toMatchObject({
      type: "endpoint_http_response",
      requestId: "http-restart",
      status: 200,
    });
    expect(messages.some((message) => message.type === "endpoint_http_error")).toBe(false);
  });

  it("forwards websocket subprotocols and text frames required by Vite HMR", async () => {
    const messages: BridgeMessage[] = [];
    const manager = new ManagedProcessManager(new Map(), (message) => messages.push(message));
    const server = http.createServer();
    const webSocketServer = new WebSocketServer({ server });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server port");
    const connection = new Promise<{ protocol: string; reply: Promise<boolean> }>((resolve) => {
      webSocketServer.once("connection", (socket) => {
        const reply = new Promise<boolean>((resolveReply) => {
          socket.once("message", (_data, isBinary) => resolveReply(isBinary));
        });
        socket.send(JSON.stringify({ type: "connected" }));
        resolve({ protocol: socket.protocol, reply });
      });
    });

    manager.openWebSocket({
      requestId: "ws-hmr",
      port: address.port,
      path: "/",
      headers: {},
      protocols: ["vite-hmr"],
    });

    await waitFor(messages, (message) => message.type === "endpoint_ws_opened");
    const connected = await connection;
    expect(connected.protocol).toBe("vite-hmr");
    const update = await waitFor(
      messages,
      (message) => message.type === "endpoint_ws_data" && message.requestId === "ws-hmr",
    );
    expect(update).toMatchObject({
      type: "endpoint_ws_data",
      dataBase64: Buffer.from(JSON.stringify({ type: "connected" })).toString("base64"),
      isBinary: false,
    });
    manager.sendWebSocketData(
      "ws-hmr",
      Buffer.from(JSON.stringify({ type: "custom", event: "vite:ping" })).toString("base64"),
      false,
    );
    expect(await connected.reply).toBe(false);
    manager.destroyAll();
    await new Promise<void>((resolve) => webSocketServer.close(() => resolve()));
  });

  it("rejects unsafe working directories", async () => {
    const messages: BridgeMessage[] = [];
    const manager = new ManagedProcessManager(new Map([["session-1", process.cwd()]]), (message) =>
      messages.push(message),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    manager.start({
      requestId: "start-1",
      processInstanceId: "process-1",
      sessionGroupId: "group-1",
      sessionId: "session-1",
      command: "printf no",
      cwd: "../outside",
    });

    const error = await waitFor(messages, (message) => message.type === "app_process_error");
    expect(error).toMatchObject({ type: "app_process_error", processInstanceId: "process-1" });
    warn.mockRestore();
  });
});
