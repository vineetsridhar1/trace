import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/main.js";

describe("Trace CLI", () => {
  let directory: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "trace-cli-test-"));
    vi.stubEnv("TRACE_CONFIG_DIR", directory);
    vi.stubEnv("TRACE_CREDENTIAL_STORE", "file");
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "");
    vi.stubEnv("TRACE_SESSION_ID", "");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "");
    stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("pairs a CLI device without printing its credential and protects the fallback file", async () => {
    const token = "opaque-secret-that-must-not-be-printed";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ token, deviceId: "device-1", organizationId: "org-1" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    await expect(
      run(["auth", "pair", "pair-code", "--server", "https://trace.test", "--json"]),
    ).resolves.toBe(0);

    const output = stdout.mock.calls.flat().join("");
    expect(output).toContain('"authenticated":true');
    expect(output).not.toContain(token);
    expect((await stat(join(directory, "credentials.json"))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(directory, "credentials.json"), "utf8")).toContain(token);
  });

  it("returns a stable authentication exit code and JSON error", async () => {
    await expect(run(["session", "list", "--json"])).resolves.toBe(2);
    expect(stderr.mock.calls.flat().join("")).toContain('"category":"authentication"');
  });

  it("returns a stable validation exit code for an invalid server", async () => {
    await expect(run(["context", "--server", "not-a-url", "--json"])).resolves.toBe(4);
    expect(stderr.mock.calls.flat().join("")).toContain('"category":"validation"');
  });

  it("uses implicit session context without exposing the injected bearer", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_ID", "session-1");
    vi.stubEnv("TRACE_SESSION_GROUP_ID", "group-1");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_SERVER_URL", "https://trace.test");

    await expect(run(["context", "--json"])).resolves.toBe(0);
    const output = stdout.mock.calls.flat().join("");
    expect(output).toContain('"sessionId":"session-1"');
    expect(output).toContain('"authentication":"session"');
    expect(output).not.toContain("injected-agent-secret");
  });
});
