import { execFile, spawn, type ChildProcessWithoutNullStreams } from "child_process";
import http from "http";
import path from "path";
import { promisify } from "util";
import WebSocket from "ws";
import type { BridgeMessage } from "@trace/shared";

type SendFn = (message: BridgeMessage) => void;
export type ListeningPortDetector = () => Promise<number[]>;

type ManagedProcess = {
  processInstanceId: string;
  sessionGroupId: string;
  child: ChildProcessWithoutNullStreams;
  bridgeProcessId: string;
  detectedPorts: Set<number>;
  portDetectionTimer: NodeJS.Timeout | null;
};

const MAX_LOG_CHUNK_BYTES = 16 * 1024;
const MAX_SETUP_OUTPUT_BYTES = 64 * 1024;
const PORT_DETECTION_INTERVAL_MS = 500;
const PORT_DETECTION_WINDOW_MS = 30_000;
const DENYLISTED_PORTS = new Set([22, 2375, 2376, 5432, 6379, 7456]);
const execFileAsync = promisify(execFile);

function safeRelativeCwd(baseWorkdir: string, cwd: string): string {
  const relative = cwd.trim() || ".";
  if (
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith("../") ||
    relative.includes("/../") ||
    relative.endsWith("/..")
  ) {
    throw new Error("Working directory must be relative and stay inside the workspace");
  }
  const resolved = path.resolve(baseWorkdir, relative);
  if (resolved !== baseWorkdir && !resolved.startsWith(`${baseWorkdir}${path.sep}`)) {
    throw new Error("Working directory escapes workspace");
  }
  return resolved;
}

function childEnv(env?: Record<string, string>): NodeJS.ProcessEnv {
  return { ...process.env, ...(env ?? {}) };
}

function capChunk(data: Buffer): string {
  return data.byteLength > MAX_LOG_CHUNK_BYTES
    ? data.subarray(0, MAX_LOG_CHUNK_BYTES).toString("utf8")
    : data.toString("utf8");
}

function signalProcessTree(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  const pid = child.pid;
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    child.kill(signal);
  }
}

function isForwardablePort(port: number): boolean {
  return Number.isInteger(port) && port > 1024 && port <= 65535 && !DENYLISTED_PORTS.has(port);
}

function portsFromListeningOutput(output: string): number[] {
  const ports = new Set<number>();
  for (const line of output.split("\n")) {
    if (!/\bLISTEN\b/i.test(line)) continue;
    const matches = line.matchAll(/(?:^|\s)\S+:(\d{2,5})(?:\s|$)/g);
    for (const match of matches) {
      const port = Number.parseInt(match[1] ?? "", 10);
      if (isForwardablePort(port)) ports.add(port);
    }
  }
  return [...ports];
}

export async function detectListeningPorts(): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync("ss", ["-H", "-ltn"]);
    return portsFromListeningOutput(stdout);
  } catch {
    try {
      const { stdout } = await execFileAsync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"]);
      return portsFromListeningOutput(stdout);
    } catch {
      return [];
    }
  }
}

export class ManagedProcessManager {
  private processes = new Map<string, ManagedProcess>();
  private sockets = new Map<string, WebSocket>();

  constructor(
    private readonly sessionWorkdirs: Map<string, string>,
    private readonly send: SendFn,
    private readonly portDetector: ListeningPortDetector = detectListeningPorts,
  ) {}

  async start(options: {
    requestId: string;
    processInstanceId: string;
    sessionGroupId: string;
    sessionId: string;
    command: string;
    cwd: string;
    env?: Record<string, string>;
    ports?: Array<{ port: number; protocol: "http" }>;
  }) {
    const baseWorkdir = this.sessionWorkdirs.get(options.sessionId);
    if (!baseWorkdir) {
      this.send({
        type: "app_process_error",
        requestId: options.requestId,
        processInstanceId: options.processInstanceId,
        error: "Session workdir is unavailable",
      });
      return;
    }
    try {
      this.stop(options.processInstanceId);
      const baselinePorts = new Set(await this.portDetector().catch(() => []));
      const cwd = safeRelativeCwd(baseWorkdir, options.cwd);
      const child = spawn(options.command, {
        cwd,
        env: childEnv(options.env),
        shell: true,
        detached: true,
      });
      const bridgeProcessId = `${options.processInstanceId}:${child.pid ?? Date.now()}`;
      this.processes.set(options.processInstanceId, {
        processInstanceId: options.processInstanceId,
        sessionGroupId: options.sessionGroupId,
        child,
        bridgeProcessId,
        detectedPorts: new Set(),
        portDetectionTimer: null,
      });
      const managed = this.processes.get(options.processInstanceId);
      if (managed) {
        this.startPortDetection(managed, baselinePorts);
      }
      child.stdout.on("data", (chunk: Buffer) => {
        this.send({
          type: "app_process_log",
          processInstanceId: options.processInstanceId,
          stream: "stdout",
          data: capChunk(chunk),
        });
      });
      child.stderr.on("data", (chunk: Buffer) => {
        this.send({
          type: "app_process_log",
          processInstanceId: options.processInstanceId,
          stream: "stderr",
          data: capChunk(chunk),
        });
      });
      child.on("error", (error) => {
        this.removeProcess(options.processInstanceId);
        this.send({
          type: "app_process_error",
          requestId: options.requestId,
          processInstanceId: options.processInstanceId,
          error: error.message,
        });
      });
      child.on("exit", (exitCode, signal) => {
        this.removeProcess(options.processInstanceId);
        this.send({
          type: "app_process_exited",
          processInstanceId: options.processInstanceId,
          exitCode,
          signal: signal ?? undefined,
        });
      });
      this.send({
        type: "app_process_started",
        requestId: options.requestId,
        processInstanceId: options.processInstanceId,
        bridgeProcessId,
      });
    } catch (error) {
      this.send({
        type: "app_process_error",
        requestId: options.requestId,
        processInstanceId: options.processInstanceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private startPortDetection(managed: ManagedProcess, baselinePorts: Set<number>): void {
    const startedAt = Date.now();
    const poll = () => {
      if (this.processes.get(managed.processInstanceId) !== managed) return;
      if (Date.now() - startedAt > PORT_DETECTION_WINDOW_MS) {
        this.stopPortDetection(managed.processInstanceId);
        return;
      }
      void this.portDetector()
        .then((ports) => {
          const detected = ports.filter(
            (port) =>
              isForwardablePort(port) &&
              !baselinePorts.has(port) &&
              !managed.detectedPorts.has(port),
          );
          if (detected.length === 0) return;
          for (const port of detected) managed.detectedPorts.add(port);
          this.send({
            type: "app_process_ports_detected",
            processInstanceId: managed.processInstanceId,
            ports: detected.map((port) => ({ port, protocol: "http" })),
          });
        })
        .catch(() => undefined);
    };
    poll();
    managed.portDetectionTimer = setInterval(poll, PORT_DETECTION_INTERVAL_MS);
    managed.portDetectionTimer.unref();
  }

  private stopPortDetection(processInstanceId: string): void {
    const managed = this.processes.get(processInstanceId);
    if (managed?.portDetectionTimer) clearInterval(managed.portDetectionTimer);
    if (managed) managed.portDetectionTimer = null;
  }

  private removeProcess(processInstanceId: string): void {
    this.stopPortDetection(processInstanceId);
    this.processes.delete(processInstanceId);
  }

  stop(processInstanceId: string): void {
    const managed = this.processes.get(processInstanceId);
    if (!managed) return;
    this.stopPortDetection(processInstanceId);
    signalProcessTree(managed.child, "SIGTERM");
    setTimeout(() => {
      if (this.processes.has(processInstanceId)) {
        signalProcessTree(managed.child, "SIGKILL");
      }
    }, 5_000).unref();
  }

  destroyForSessionGroup(sessionGroupId: string): void {
    for (const process of this.processes.values()) {
      if (process.sessionGroupId === sessionGroupId) this.stop(process.processInstanceId);
    }
  }

  destroyAll(): void {
    for (const processInstanceId of this.processes.keys()) this.stop(processInstanceId);
    for (const socket of this.sockets.values()) socket.close();
    this.sockets.clear();
  }

  runSetupScript(options: {
    requestId: string;
    sessionId: string;
    command: string;
    cwd: string;
    env?: Record<string, string>;
  }) {
    const baseWorkdir = this.sessionWorkdirs.get(options.sessionId);
    if (!baseWorkdir) {
      this.send({
        type: "setup_script_result",
        requestId: options.requestId,
        exitCode: 1,
        error: "Session workdir is unavailable",
      });
      return;
    }
    try {
      const cwd = safeRelativeCwd(baseWorkdir, options.cwd);
      const child = spawn(options.command, {
        cwd,
        env: childEnv(options.env),
        shell: true,
        detached: false,
      });
      const chunks: Buffer[] = [];
      let bytes = 0;
      const appendOutput = (chunk: Buffer) => {
        if (bytes >= MAX_SETUP_OUTPUT_BYTES) return;
        const remaining = MAX_SETUP_OUTPUT_BYTES - bytes;
        chunks.push(chunk.subarray(0, remaining));
        bytes += Math.min(chunk.byteLength, remaining);
      };
      const collect = (stream: "stdout" | "stderr", chunk: Buffer) => {
        this.send({
          type: "setup_script_log",
          requestId: options.requestId,
          stream,
          data: capChunk(chunk),
        });
        appendOutput(chunk);
      };
      const prelude = Buffer.from(
        `[trace] Running setup script in ${cwd}\n$ ${options.command}\n`,
        "utf8",
      );
      this.send({
        type: "setup_script_log",
        requestId: options.requestId,
        stream: "stdout",
        data: prelude.toString("utf8"),
      });
      appendOutput(prelude);
      child.stdout.on("data", (chunk: Buffer) => collect("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => collect("stderr", chunk));
      child.on("error", (error) => {
        this.send({
          type: "setup_script_result",
          requestId: options.requestId,
          exitCode: 1,
          output: Buffer.concat(chunks).toString("utf8"),
          error: error.message,
        });
      });
      child.on("exit", (exitCode) => {
        this.send({
          type: "setup_script_result",
          requestId: options.requestId,
          exitCode: exitCode ?? 1,
          output: Buffer.concat(chunks).toString("utf8"),
        });
      });
    } catch (error) {
      this.send({
        type: "setup_script_result",
        requestId: options.requestId,
        exitCode: 1,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  proxyHttp(options: {
    requestId: string;
    port: number;
    method: string;
    path: string;
    headers: Record<string, string | string[]>;
    bodyBase64?: string;
  }) {
    const body = options.bodyBase64 ? Buffer.from(options.bodyBase64, "base64") : undefined;
    const req = http.request(
      {
        host: "127.0.0.1",
        port: options.port,
        method: options.method,
        path: options.path,
        headers: options.headers,
        timeout: 60_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          this.send({
            type: "endpoint_http_response",
            requestId: options.requestId,
            status: res.statusCode ?? 502,
            headers: res.headers as Record<string, string | string[]>,
            bodyBase64: Buffer.concat(chunks).toString("base64"),
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("Proxy request timed out"));
    });
    req.on("error", (error) => {
      this.send({
        type: "endpoint_http_error",
        requestId: options.requestId,
        error: error.message,
      });
    });
    if (body) req.write(body);
    req.end();
  }

  openWebSocket(options: {
    requestId: string;
    port: number;
    path: string;
    headers: Record<string, string | string[]>;
  }) {
    const socket = new WebSocket(`ws://127.0.0.1:${options.port}${options.path}`, {
      headers: options.headers,
    });
    this.sockets.set(options.requestId, socket);
    socket.on("open", () =>
      this.send({ type: "endpoint_ws_opened", requestId: options.requestId }),
    );
    socket.on("message", (data) => {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      this.send({
        type: "endpoint_ws_data",
        requestId: options.requestId,
        dataBase64: buffer.toString("base64"),
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

  sendWebSocketData(requestId: string, dataBase64: string) {
    const socket = this.sockets.get(requestId);
    if (socket?.readyState === WebSocket.OPEN) socket.send(Buffer.from(dataBase64, "base64"));
  }

  closeWebSocket(requestId: string, code?: number, reason?: string) {
    const socket = this.sockets.get(requestId);
    if (!socket) return;
    socket.close(code, reason);
    this.sockets.delete(requestId);
  }
}
