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

  it("shows global and command-specific help without authentication", async () => {
    await expect(run([])).resolves.toBe(0);
    expect(stdout.mock.calls.flat().join("")).toContain("session list");

    stdout.mockClear();
    await expect(run(["session", "start", "--help"])).resolves.toBe(0);
    const output = stdout.mock.calls.flat().join("");
    expect(output).toContain("Usage: trace session start");
    expect(output).toContain("Start a sibling session");
  });

  it("starts a sibling session with injected context without exposing the bearer", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_ID", "session-1");
    vi.stubEnv("TRACE_SESSION_GROUP_ID", "group-1");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_SERVER_URL", "https://trace.test");
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        variables: { input: Record<string, unknown> };
      };
      expect(request.variables.input).toMatchObject({
        sessionGroupId: "group-1",
        prompt: "Implement the API tests",
        tool: "codex",
      });
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer injected-agent-secret",
      );
      return new Response(
        JSON.stringify({
          data: {
            startSession: {
              id: "session-2",
              name: "API tests",
              agentStatus: "active",
              sessionStatus: "in_progress",
              tool: "codex",
              model: null,
              reasoningEffort: null,
              hosting: "local",
              branch: "trace-api-tests",
              sessionGroupId: "group-1",
              createdAt: "2026-08-08T00:00:00.000Z",
              updatedAt: "2026-08-08T00:00:00.000Z",
              channel: null,
              repo: null,
              projects: [],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      run(["session", "start", "Implement", "the", "API", "tests", "--tool", "codex", "--json"]),
    ).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(stdout.mock.calls.flat().join("")).toContain('"id":"session-2"');
    expect(stdout.mock.calls.flat().join("")).not.toContain("injected-agent-secret");
  });
});
