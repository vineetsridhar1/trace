import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import path from "path";
import net from "net";
import type { BridgeMessage } from "@trace/shared";
import { EndpointForwarder } from "./endpoint-forwarder.js";

type SendFn = (message: BridgeMessage) => void;

type ManagedProcess = {
  processInstanceId: string;
  sessionGroupId: string;
  child: ChildProcessWithoutNullStreams;
  bridgeProcessId: string;
};

const MAX_LOG_CHUNK_BYTES = 16 * 1024;
const MAX_SETUP_OUTPUT_BYTES = 64 * 1024;
// A hung setup script (interactive prompt, network stall) must not block session
// setup forever with no result. Kill the tree and report failure past this.
const SETUP_SCRIPT_TIMEOUT_MS = 10 * 60_000;

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

const SENSITIVE_ENV_EXACT = new Set(["TRACE_RUNTIME_TOKEN", "GITHUB_TOKEN"]);

// Server-only secrets the publicly-served app must never inherit. DATABASE_URL
// is intentionally kept — the app is expected to use its container-local DB.
// (This is defense-in-depth: it is NOT a hard boundary because the child runs as
// the same uid as the bridge and could read /proc/<bridge>/environ. A separate
// low-privilege uid for app processes is the real isolation and remains TODO.)
function isSensitiveEnvName(name: string): boolean {
  if (SENSITIVE_ENV_EXACT.has(name)) return true;
  const upper = name.toUpperCase();
  return upper.endsWith("_TOKEN") || upper.includes("SECRET") || upper.includes("PRIVATE_KEY");
}

function childEnv(env?: Record<string, string>): NodeJS.ProcessEnv {
  const bridgeEnv: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (isSensitiveEnvName(key)) continue;
    bridgeEnv[key] = value;
  }
  // Explicit per-process env always wins (an app may be handed its own tokens).
  return { ...bridgeEnv, ...(env ?? {}) };
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

// SIGTERM a child's process group, escalate to SIGKILL after a grace period,
// and resolve once it has actually exited so a replacement can spawn cleanly.
function terminateChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.killed) return Promise.resolve();
  return new Promise((resolve) => {
    const kill = setTimeout(() => signalProcessTree(child, "SIGKILL"), 5_000);
    kill.unref();
    child.once("exit", () => {
      clearTimeout(kill);
      resolve();
    });
    signalProcessTree(child, "SIGTERM");
  });
}

function waitForListeningPort(
  child: ChildProcessWithoutNullStreams,
  ports: number[],
  timeoutMs = 5 * 60_000,
): Promise<void> {
  if (ports.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const probe = () => {
      if (child.exitCode !== null || child.killed) {
        reject(new Error("App process exited before opening its configured port"));
        return;
      }
      let pending = ports.length;
      let settled = false;
      for (const port of ports) {
        const socket = net.createConnection({ host: "127.0.0.1", port });
        socket.once("connect", () => {
          if (settled) return;
          settled = true;
          socket.destroy();
          resolve();
        });
        socket.once("error", () => {
          pending -= 1;
          if (!settled && pending === 0) {
            if (Date.now() >= deadline) reject(new Error("Timed out waiting for app port"));
            else setTimeout(probe, 250).unref();
          }
        });
      }
    };
    probe();
  });
}

export class ManagedProcessManager {
  private processes = new Map<string, ManagedProcess>();
  // Per-processInstanceId serialization for start/restart (see start()).
  private startLocks = new Map<string, Promise<void>>();
  private readonly endpointForwarder: EndpointForwarder;

  constructor(
    private readonly sessionWorkdirs: Map<string, string>,
    private readonly send: SendFn,
  ) {
    this.endpointForwarder = new EndpointForwarder(send);
  }

  start(options: {
    requestId: string;
    processInstanceId: string;
    sessionGroupId: string;
    sessionId: string;
    command: string;
    cwd: string;
    env?: Record<string, string>;
    ports?: number[];
  }) {
    // Serialize starts per processInstanceId. Without this, a second start
    // arriving during `startReplacing`'s await of the previous child's exit
    // would spawn concurrently and leave an orphaned process holding the port.
    const key = options.processInstanceId;
    const prev = this.startLocks.get(key) ?? Promise.resolve();
    const run = prev.then(
      () => this.startReplacing(options),
      () => this.startReplacing(options),
    );
    const tail = run.then(
      () => {},
      () => {},
    );
    this.startLocks.set(key, tail);
    void tail.then(() => {
      if (this.startLocks.get(key) === tail) this.startLocks.delete(key);
    });
  }

  /**
   * The server reuses one processInstanceId per configured process, so a
   * restart re-enters here while the previous child may still be running. Take
   * ownership of the old entry first (its exit must not clobber the new
   * process's state) and wait for it to die before spawning, so the new child
   * never races the old one for the configured ports.
   */
  private async startReplacing(options: {
    requestId: string;
    processInstanceId: string;
    sessionGroupId: string;
    sessionId: string;
    command: string;
    cwd: string;
    env?: Record<string, string>;
    ports?: number[];
  }): Promise<void> {
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
      const previous = this.processes.get(options.processInstanceId);
      if (previous) {
        // Remove the entry before killing so the old child's exit handler
        // (guarded by an identity check) stays silent — the server already
        // accounted for this process when it requested the replacement.
        this.processes.delete(options.processInstanceId);
        await terminateChild(previous.child);
      }
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
      });
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
        if (this.processes.get(options.processInstanceId)?.child !== child) return;
        this.processes.delete(options.processInstanceId);
        this.send({
          type: "app_process_error",
          requestId: options.requestId,
          processInstanceId: options.processInstanceId,
          error: error.message,
        });
      });
      child.on("exit", (exitCode, signal) => {
        if (this.processes.get(options.processInstanceId)?.child !== child) return;
        this.processes.delete(options.processInstanceId);
        this.send({
          type: "app_process_exited",
          processInstanceId: options.processInstanceId,
          exitCode,
          signal: signal ?? undefined,
        });
      });
      void waitForListeningPort(child, options.ports ?? [])
        .then(() => {
          if (this.processes.get(options.processInstanceId)?.child !== child) return;
          this.send({
            type: "app_process_started",
            requestId: options.requestId,
            processInstanceId: options.processInstanceId,
            bridgeProcessId,
          });
        })
        .catch((error: unknown) => {
          if (this.processes.get(options.processInstanceId)?.child !== child) return;
          this.stop(options.processInstanceId);
          this.send({
            type: "app_process_error",
            requestId: options.requestId,
            processInstanceId: options.processInstanceId,
            error: error instanceof Error ? error.message : String(error),
          });
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

  stop(processInstanceId: string): void {
    const managed = this.processes.get(processInstanceId);
    if (!managed) return;
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
    this.endpointForwarder.destroy();
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
        // Own process group so a timeout can kill the whole tree.
        detached: true,
      });
      const chunks: Buffer[] = [];
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;
      const finish = (result: { exitCode: number; output?: string; error?: string }): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.send({ type: "setup_script_result", requestId: options.requestId, ...result });
      };
      timeout = setTimeout(() => {
        signalProcessTree(child, "SIGKILL");
        finish({
          exitCode: 1,
          output: Buffer.concat(chunks).toString("utf8"),
          error: `Setup script timed out after ${Math.round(SETUP_SCRIPT_TIMEOUT_MS / 1000)}s`,
        });
      }, SETUP_SCRIPT_TIMEOUT_MS);
      timeout.unref();
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
        finish({
          exitCode: 1,
          output: Buffer.concat(chunks).toString("utf8"),
          error: error.message,
        });
      });
      child.on("exit", (exitCode) => {
        finish({
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

  proxyHttp(options: Parameters<EndpointForwarder["proxyHttp"]>[0]): void {
    this.endpointForwarder.proxyHttp(options);
  }

  openWebSocket(options: Parameters<EndpointForwarder["openWebSocket"]>[0]): void {
    this.endpointForwarder.openWebSocket(options);
  }

  sendWebSocketData(requestId: string, dataBase64: string, isBinary = true): void {
    this.endpointForwarder.sendWebSocketData(requestId, dataBase64, isBinary);
  }

  closeWebSocket(requestId: string, code?: number, reason?: string): void {
    this.endpointForwarder.closeWebSocket(requestId, code, reason);
  }
}
