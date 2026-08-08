import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/main.js";

describe("Trace CLI", () => {
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "");
    vi.stubEnv("TRACE_SESSION_ID", "");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "");
    stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns a stable authentication exit code and JSON error", async () => {
    vi.stubEnv("TRACE_SESSION_ID", "session-1");
    await expect(run(["session", "get", "--json"])).resolves.toBe(2);
    expect(stderr.mock.calls.flat().join("")).toContain('"category":"authentication"');
  });

  it("does not expose public authentication commands", async () => {
    await expect(run(["auth", "pair", "--json"])).resolves.toBe(64);
    expect(stderr.mock.calls.flat().join("")).toContain('"category":"usage"');
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
