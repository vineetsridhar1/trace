import http from "http";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BridgeMessage } from "@trace/shared";
import { ManagedProcessManager } from "./managed-process-manager.js";

function waitFor(messages: BridgeMessage[], predicate: (message: BridgeMessage) => boolean) {
  return new Promise<BridgeMessage>((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const match = messages.find(predicate);
      if (match) {
        clearInterval(timer);
        resolve(match);
      } else if (Date.now() - started > 3000) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for bridge message"));
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

  it("reports newly detected listening ports for managed app processes", async () => {
    const messages: BridgeMessage[] = [];
    const detectPorts = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([5173]);
    const manager = new ManagedProcessManager(
      new Map([["session-1", process.cwd()]]),
      (message) => messages.push(message),
      detectPorts,
    );

    void manager.start({
      requestId: "start-1",
      processInstanceId: "process-1",
      sessionGroupId: "group-1",
      sessionId: "session-1",
      command: 'node -e "setInterval(() => {}, 1000)"',
      cwd: ".",
    });

    const detected = await waitFor(
      messages,
      (message) => message.type === "app_process_ports_detected",
    );
    expect(detected).toMatchObject({
      type: "app_process_ports_detected",
      processInstanceId: "process-1",
      ports: [{ port: 5173, protocol: "http" }],
    });

    manager.stop("process-1");
    await waitFor(messages, (message) => message.type === "app_process_exited");
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
    });

    await waitFor(messages, (message) => message.type === "app_process_started");
    await waitForHttp(port);
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

  it("starts an app process, detects its preview port, and proxies rendered HTML", async () => {
    const messages: BridgeMessage[] = [];
    const port = await getFreePort();
    const detectPorts = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([port]);
    const manager = new ManagedProcessManager(
      new Map([["session-1", process.cwd()]]),
      (message) => messages.push(message),
      detectPorts,
    );

    manager.start({
      requestId: "start-1",
      processInstanceId: "process-1",
      sessionGroupId: "group-1",
      sessionId: "session-1",
      command: `node -e "require('http').createServer((req,res)=>{res.writeHead(200, {'content-type':'text/html'}); res.end('<main data-trace-source=\\\"app/page.tsx:11\\\">Preview app</main>')}).listen(${port}, '127.0.0.1')"`,
      cwd: ".",
    });

    await waitFor(messages, (message) => message.type === "app_process_started");
    await waitForHttp(port);
    const detected = await waitFor(
      messages,
      (message) => message.type === "app_process_ports_detected",
    );
    expect(detected).toMatchObject({
      type: "app_process_ports_detected",
      processInstanceId: "process-1",
      ports: [{ port, protocol: "http" }],
    });

    manager.proxyHttp({
      requestId: "http-1",
      port,
      method: "GET",
      path: "/",
      headers: {},
    });

    const response = await waitFor(
      messages,
      (message) => message.type === "endpoint_http_response",
    );
    expect(response).toMatchObject({
      type: "endpoint_http_response",
      requestId: "http-1",
      status: 200,
    });
    if (response.type !== "endpoint_http_response" || !response.bodyBase64) {
      throw new Error("Missing HTTP proxy body");
    }
    const body = Buffer.from(response.bodyBase64, "base64").toString("utf8");
    expect(body).toContain("Preview app");
    expect(body).toContain('data-trace-source="app/page.tsx:11"');

    manager.stop("process-1");
    await waitFor(messages, (message) => message.type === "app_process_exited");
    await waitForPortAvailable(port);
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
