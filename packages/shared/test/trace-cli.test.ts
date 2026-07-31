import { spawn } from "child_process";
import { createServer } from "http";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

describe("trace artifact push", () => {
  it("uploads a directory as one gzip bundle", async () => {
    let request:
      | {
          path: string | undefined;
          type: string | undefined;
          key: string | undefined;
          bytes: number;
        }
      | undefined;
    const server = createServer((incoming, response) => {
      let bytes = 0;
      incoming.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
      });
      incoming.on("end", () => {
        request = {
          path: incoming.url,
          type: incoming.headers["x-trace-artifact-type"] as string | undefined,
          key: incoming.headers["x-trace-artifact-key"] as string | undefined,
          bytes,
        };
        response.writeHead(201, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ artifact: { id: "artifact-test" } }));
      });
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");

    try {
      const child = spawn(
        resolve(repositoryRoot, "runtime/bin/trace"),
        [
          "artifact",
          "push",
          "visual-plan",
          resolve(repositoryRoot, "runtime/skills/visual-plan"),
          "--key",
          "primary",
        ],
        {
          env: {
            ...process.env,
            TRACE_API_URL: `http://127.0.0.1:${address.port}`,
            TRACE_INVOCATION_TOKEN: "test-token",
            TRACE_NODE_BINARY: process.execPath,
          },
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      const exitCode = await new Promise<number | null>((resolveExit) =>
        child.on("close", resolveExit),
      );

      expect(exitCode, stderr).toBe(0);
      expect(stdout.trim()).toBe("artifact-test");
      expect(request).toMatchObject({
        path: "/agent/artifacts",
        type: "visual-plan",
        key: "primary",
      });
      expect(request?.bytes).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
    }
  });
});
