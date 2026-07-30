import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildTraceVisualPlanInstruction,
  materializeTracePlanRuntime,
  traceApiUrlFromBridgeUrl,
} from "../src/trace-cli.js";

const execFileAsync = promisify(execFile);
const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupPaths
      .splice(0)
      .map((target) => fs.promises.rm(target, { recursive: true, force: true })),
  );
});

describe("Trace runtime CLI", () => {
  it("materializes the authenticated CLI and complete visual-plan skill", async () => {
    const runtime = materializeTracePlanRuntime({
      sessionId: "session-1",
      runId: "run-1",
      runToken: "token-1",
      serverUrl: "wss://trace.example/bridge",
      inheritedPath: "/usr/bin",
    });
    cleanupPaths.push(runtime.rootDir);

    expect(traceApiUrlFromBridgeUrl("ws://localhost:4000/bridge")).toBe("http://localhost:4000");
    expect(runtime.env).toMatchObject({
      TRACE_API_URL: "https://trace.example",
      TRACE_RUN_ID: "run-1",
      TRACE_RUN_TOKEN: "token-1",
      TRACE_SESSION_ID: "session-1",
    });
    expect((await fs.promises.stat(runtime.cliPath)).mode & 0o111).not.toBe(0);
    expect(await fs.promises.readFile(runtime.skillPath, "utf8")).toContain(
      "trace output push --type visual-plan",
    );
    expect(
      await fs.promises.readFile(
        path.join(path.dirname(runtime.skillPath), "references", "trace-plan-blocks.md"),
        "utf8",
      ),
    ).toContain("<AnnotatedCode>");
    expect(buildTraceVisualPlanInstruction(runtime.skillPath)).toContain(runtime.skillPath);
  });

  it("uploads the exact selected file through the run-scoped server endpoint", async () => {
    let received: Record<string, unknown> | null = null;
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        response.writeHead(201, { "content-type": "application/json" });
        response.end(
          JSON.stringify({ contentHash: "server-hash", validationErrors: [], ready: true }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not start");

    const runtime = materializeTracePlanRuntime({
      sessionId: "session-2",
      runId: "run-2",
      runToken: "token-2",
      serverUrl: `http://127.0.0.1:${address.port}`,
    });
    cleanupPaths.push(runtime.rootDir);
    const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "trace-cli-test-"));
    cleanupPaths.push(workDir);
    const planPath = path.join(workDir, "chosen-plan.mdx");
    const content = '# Plan\n<Callout tone="decision">Use events.</Callout>\n';
    await fs.promises.writeFile(planPath, content, "utf8");

    const result = await execFileAsync(
      runtime.cliPath,
      ["output", "push", "--type", "visual-plan", "--file", planPath, "--final"],
      { env: { ...process.env, ...runtime.env } },
    );
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    expect(result.stdout).toContain("submitted for review");
    expect(received).toMatchObject({
      type: "visual-plan",
      state: "final",
      runId: "run-2",
      sessionId: "session-2",
      filename: "chosen-plan.mdx",
      sourcePath: planPath,
      content,
    });
  });
});
