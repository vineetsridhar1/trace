import fs from "fs";
import net from "net";
import path from "path";
import { DbctlService } from "./service.js";
import { isDbctlRequest } from "@trace/dbctl-protocol";

export interface RunDbctlDaemonOptions {
  rootDir: string;
  socketPath: string;
}

function ensureDir(targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
}

export async function runDbctlDaemon(options: RunDbctlDaemonOptions): Promise<void> {
  ensureDir(options.rootDir);
  ensureDir(path.dirname(options.socketPath));
  if (fs.existsSync(options.socketPath)) {
    fs.rmSync(options.socketPath, { force: true });
  }

  const service = new DbctlService({ rootDir: options.rootDir });

  await new Promise<void>((resolve, reject) => {
    const server = net.createServer((socket) => {
      let buffer = "";
      socket.setEncoding("utf-8");
      socket.on("data", (chunk) => {
        buffer += chunk;
      });
      socket.on("end", async () => {
        let response: unknown;
        try {
          const raw = JSON.parse(buffer);
          if (!isDbctlRequest(raw)) {
            response = { ok: false, error: "Invalid dbctl request" };
          } else {
            response = await service.handle(raw);
          }
        } catch (error) {
          response = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
        socket.end(JSON.stringify(response));
      });
    });

    server.on("error", reject);
    server.listen(options.socketPath, () => {
      fs.chmodSync(options.socketPath, 0o600);
      resolve();
    });

    process.on("SIGTERM", () => {
      server.close(() => process.exit(0));
    });
    process.on("SIGINT", () => {
      server.close(() => process.exit(0));
    });
  });
}
