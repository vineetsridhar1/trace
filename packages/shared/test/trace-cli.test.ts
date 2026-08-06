import { spawn } from "child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { createServer } from "http";
import { tmpdir } from "os";
import { join, resolve } from "path";
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
        ["artifact", "push", "visual-plan", resolve(repositoryRoot, "runtime/skills/visual-plan")],
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

describe("trace design pull", () => {
  it("atomically materializes the latest linked design source", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "trace-cli-design-fixture-"));
    const workspace = await mkdtemp(join(tmpdir(), "trace-cli-design-workspace-"));
    await mkdir(join(fixture, "src/design/screens"), { recursive: true });
    await writeFile(join(fixture, "src/design/screens/Welcome.tsx"), "export const Welcome = 1;\n");
    await writeFile(join(fixture, "design.canvas.json"), '{"screens":[]}\n');
    const archive = join(fixture, "design.tar.gz");
    const packed = spawn("tar", ["-czf", archive, "-C", fixture, "src", "design.canvas.json"]);
    expect(await new Promise<number | null>((done) => packed.on("close", done))).toBe(0);
    const archiveBytes = await readFile(archive);

    const server = createServer((incoming, response) => {
      if (incoming.url === "/agent/designs") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            designs: [
              {
                id: "design-1",
                name: "Welcome",
                slug: "welcome",
                commitSha: "commit-2",
                archivePath: "/agent/designs/design-1/archive",
              },
            ],
          }),
        );
        return;
      }
      if (incoming.url === "/agent/designs/design-1/archive") {
        response.writeHead(200, {
          "Content-Type": "application/gzip",
          "X-Trace-Design-Commit": "commit-2",
        });
        response.end(archiveBytes);
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");

    try {
      await mkdir(join(workspace, ".trace/designs/welcome"), { recursive: true });
      await writeFile(join(workspace, ".trace/designs/welcome/stale.txt"), "stale");
      const child = spawn(resolve(repositoryRoot, "runtime/bin/trace"), ["design", "pull"], {
        cwd: workspace,
        env: {
          ...process.env,
          TRACE_API_URL: `http://127.0.0.1:${address.port}`,
          TRACE_INVOCATION_TOKEN: "test-token",
          TRACE_NODE_BINARY: process.execPath,
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      const exitCode = await new Promise<number | null>((done) => child.on("close", done));

      expect(exitCode, stderr).toBe(0);
      expect(stdout.trim()).toBe("welcome commit-2");
      expect(
        await readFile(
          join(workspace, ".trace/designs/welcome/src/design/screens/Welcome.tsx"),
          "utf8",
        ),
      ).toContain("Welcome");
      await expect(readFile(join(workspace, ".trace/designs/welcome/stale.txt"))).rejects.toThrow();
    } finally {
      await new Promise<void>((resolveClose, reject) =>
        server.close((error) => (error ? reject(error) : resolveClose())),
      );
      await rm(fixture, { recursive: true, force: true });
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
