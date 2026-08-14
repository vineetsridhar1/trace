import { spawn } from "child_process";
import { chmod, mkdtemp, rm, writeFile } from "fs/promises";
import { createServer } from "http";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";
import { buildTraceInvocationEnv } from "../src/trace-invocation-env.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

describe("trace artifact push", () => {
  it("fails closed when browser video validation rejects the recording", async () => {
    const root = await mkdtemp(join(tmpdir(), "trace-video-cli-test-"));
    const video = join(root, "proof.webm");
    const validator = join(root, "reject-video");
    await writeFile(video, "not a video");
    await writeFile(validator, "#!/bin/sh\nexit 1\n");
    await chmod(validator, 0o755);

    try {
      const child = spawn("trace", ["artifact", "push", "video", video], {
        env: buildTraceInvocationEnv({
          runtimeEnv: {
            TRACE_BROWSER_VIDEO_DIR: root,
            TRACE_BROWSER_VIDEO_VALIDATE: validator,
            TRACE_INVOCATION_TOKEN: "test-token",
          },
          serverUrl: "ws://127.0.0.1:1/bridge",
          skillsDir: resolve(repositoryRoot, "runtime/skills"),
          binDir: resolve(repositoryRoot, "runtime/bin"),
          nodeBinary: process.execPath,
          basePath: process.env.PATH,
        }),
      });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      const exitCode = await new Promise<number | null>((resolveExit) =>
        child.on("close", resolveExit),
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain("video validation failed; artifact was not uploaded");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uploads a directory as one gzip bundle", async () => {
    let request:
      | {
          path: string | undefined;
          authorization: string | undefined;
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
          authorization: incoming.headers.authorization,
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
        "trace",
        [
          "artifact",
          "push",
          "file-bundle",
          resolve(repositoryRoot, "runtime/skills/trace-session"),
        ],
        {
          env: buildTraceInvocationEnv({
            runtimeEnv: {
              TRACE_SESSION_ID: "session-test",
              TRACE_INVOCATION_ID: "invocation-test",
              TRACE_INVOCATION_TOKEN: "test-token",
            },
            serverUrl: `ws://127.0.0.1:${address.port}/bridge?token=bridge-token`,
            skillsDir: resolve(repositoryRoot, "runtime/skills"),
            binDir: resolve(repositoryRoot, "runtime/bin"),
            nodeBinary: process.execPath,
            basePath: process.env.PATH,
          }),
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
        authorization: "Bearer test-token",
        type: "file-bundle",
        key: "default",
      });
      expect(request?.bytes).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
    }
  });
});
