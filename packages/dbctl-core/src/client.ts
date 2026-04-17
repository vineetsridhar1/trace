import { spawn } from "child_process";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import type { DbctlRequest, DbctlResponse, DbctlRuntimeKind } from "@trace/dbctl-protocol";
import { isDbctlResponse } from "@trace/dbctl-protocol";

export function createDefaultDbctlRoot(runtime: DbctlRuntimeKind): string {
  return runtime === "local"
    ? path.join(os.homedir(), ".trace", "dbctl")
    : "/var/lib/trace-db";
}

export function createDefaultDbctlSocketPath(runtime: DbctlRuntimeKind): string {
  return path.join(createDefaultDbctlRoot(runtime), "run", "dbctl.sock");
}

export async function waitForDbctlSocket(socketPath: string, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(socketPath)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for dbctl socket at ${socketPath}`);
}

export async function ensureDbctlDaemonRunning(options: {
  daemonScriptPath: string;
  runtime: DbctlRuntimeKind;
  socketPath?: string;
  rootDir?: string;
}): Promise<string> {
  const socketPath = options.socketPath ?? createDefaultDbctlSocketPath(options.runtime);
  if (fs.existsSync(socketPath)) {
    return socketPath;
  }

  const rootDir = options.rootDir ?? createDefaultDbctlRoot(options.runtime);
  fs.mkdirSync(path.dirname(socketPath), { recursive: true });

  const isElectron = Boolean(process.versions.electron);
  const command = process.execPath;
  const args = isElectron
    ? ["--runAsNode", options.daemonScriptPath]
    : [options.daemonScriptPath];

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      TRACE_DBCTL_ROOT: rootDir,
      TRACE_DBCTL_SOCKET_PATH: socketPath,
      TRACE_DBCTL_RUNTIME: options.runtime,
    },
  });
  child.unref();

  await waitForDbctlSocket(socketPath, 15_000);
  return socketPath;
}

export function createDbctlClient(socketPath: string) {
  return {
    send(request: DbctlRequest): Promise<DbctlResponse> {
      return new Promise((resolve, reject) => {
        const socket = net.createConnection(socketPath);
        let buffer = "";
        socket.setEncoding("utf-8");
        socket.on("connect", () => {
          socket.end(JSON.stringify(request));
        });
        socket.on("data", (chunk) => {
          buffer += chunk;
        });
        socket.on("end", () => {
          try {
            const response = JSON.parse(buffer);
            if (!isDbctlResponse(response)) {
              reject(new Error("Invalid dbctl response"));
              return;
            }
            resolve(response);
          } catch (error) {
            reject(error);
          }
        });
        socket.on("error", reject);
      });
    },
  };
}
