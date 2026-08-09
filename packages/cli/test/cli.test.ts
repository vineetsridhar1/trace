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
    vi.stubEnv("TRACE_SERVER_URL", "http://localhost:4000");
    vi.stubEnv("TRACE_API_URL", "https://trace.test");

    await expect(run(["context", "--json"])).resolves.toBe(0);
    const output = stdout.mock.calls.flat().join("");
    expect(output).toContain('"sessionId":"session-1"');
    expect(output).toContain('"authentication":"session"');
    expect(output).toContain('"serverUrl":"https://trace.test"');
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
    vi.stubEnv("TRACE_SERVER_URL", "http://localhost:4000");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.toString()).toBe("https://trace.test/graphql");
      const request = JSON.parse(String(init?.body)) as {
        query: string;
        variables: { input: Record<string, unknown> };
      };
      expect(request.query).not.toContain("projects {");
      expect(request.variables.input).toMatchObject({
        clientMutationId: expect.any(String),
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
    expect(stdout.mock.calls.flat().join("")).toContain('"runRequested":true');
    expect(stdout.mock.calls.flat().join("")).toContain('"uiPath":"/g/group-1/s/session-2"');
    expect(stdout.mock.calls.flat().join("")).not.toContain("injected-agent-secret");
  });

  it("requires a destination when group-level options create a new coding group", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_ID", "session-1");
    vi.stubEnv("TRACE_SESSION_GROUP_ID", "group-1");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(run(["session", "start", "hello", "--hosting", "local", "--json"])).resolves.toBe(
      64,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.mock.calls.flat().join("")).toContain("requires --channel, --project, or --repo");
  });

  it("creates a new repo-targeted group without inheriting the current group", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_ID", "session-1");
    vi.stubEnv("TRACE_SESSION_GROUP_ID", "group-1");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        query: string;
        variables: { input: Record<string, unknown> };
      };
      expect(request.query).not.toContain("projects {");
      expect(request.variables.input).toEqual({
        clientMutationId: "start-key-1",
        prompt: "hello",
        hosting: "local",
        repoId: "repo-1",
      });
      return new Response(
        JSON.stringify({
          data: {
            startSession: {
              id: "session-2",
              name: "hello",
              agentStatus: "active",
              sessionStatus: "in_progress",
              tool: "codex",
              model: null,
              reasoningEffort: null,
              hosting: "local",
              branch: null,
              sessionGroupId: "group-2",
              createdAt: "2026-08-08T00:00:00.000Z",
              updatedAt: "2026-08-08T00:00:00.000Z",
              channel: null,
              repo: null,
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      run([
        "session",
        "start",
        "hello",
        "--repo",
        "repo-1",
        "--hosting",
        "local",
        "--idempotency-key",
        "start-key-1",
        "--json",
      ]),
    ).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("derives the repository from a selected channel before starting", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        query: string;
        variables: Record<string, unknown>;
      };
      if (request.query.includes("TraceCliStartChannel")) {
        return new Response(
          JSON.stringify({
            data: {
              channel: { id: "channel-1", name: "API", repo: { id: "repo-1", name: "trace" } },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      expect(request.variables.input).toMatchObject({ channelId: "channel-1", repoId: "repo-1" });
      return new Response(
        JSON.stringify({
          data: {
            startSession: {
              id: "session-2",
              name: "hello",
              agentStatus: "not_started",
              sessionStatus: "in_progress",
              tool: "codex",
              model: null,
              reasoningEffort: null,
              hosting: "local",
              branch: null,
              sessionGroupId: "group-2",
              createdAt: "2026-08-08T00:00:00.000Z",
              updatedAt: "2026-08-08T00:00:00.000Z",
              channel: { id: "channel-1", name: "API" },
              repo: { id: "repo-1", name: "trace" },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      run(["session", "start", "hello", "--channel", "channel-1", "--json"]),
    ).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stdout.mock.calls.flat().join("")).toContain(
      '"uiPath":"/c/channel-1/g/group-2/s/session-2"',
    );
  });

  it("derives the repository from a selected project before starting", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        query: string;
        variables: Record<string, unknown>;
      };
      if (request.query.includes("TraceCliStartProject")) {
        return new Response(
          JSON.stringify({
            data: {
              project: {
                id: "project-1",
                name: "Launch",
                repo: { id: "repo-1", name: "trace" },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      expect(request.variables.input).toMatchObject({ projectId: "project-1", repoId: "repo-1" });
      return new Response(
        JSON.stringify({
          data: {
            startSession: {
              id: "session-2",
              name: "hello",
              agentStatus: "not_started",
              sessionStatus: "in_progress",
              tool: "codex",
              model: null,
              reasoningEffort: null,
              hosting: "cloud",
              branch: null,
              sessionGroupId: "group-2",
              createdAt: "2026-08-08T00:00:00.000Z",
              updatedAt: "2026-08-08T00:00:00.000Z",
              channel: null,
              repo: { id: "repo-1", name: "trace" },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      run(["session", "start", "hello", "--project", "project-1", "--json"]),
    ).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stdout.mock.calls.flat().join("")).toContain('"uiPath":"/g/group-2/s/session-2"');
  });

  it("requires an explicit repo when a selected channel has none", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { channel: { id: "channel-1", name: "General", repo: null } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      run(["session", "start", "hello", "--channel", "channel-1", "--json"]),
    ).resolves.toBe(64);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(stderr.mock.calls.flat().join("")).toContain("has no repository; add --repo");
  });

  it("retries an empty start response with the same idempotency key", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const keys: unknown[] = [];
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        variables: { input: Record<string, unknown> };
      };
      keys.push(request.variables.input.clientMutationId);
      if (keys.length === 1) {
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(
        JSON.stringify({
          data: {
            startSession: {
              id: "session-2",
              name: "hello",
              agentStatus: "not_started",
              sessionStatus: "in_progress",
              tool: "codex",
              model: null,
              reasoningEffort: null,
              hosting: "local",
              branch: null,
              sessionGroupId: "group-2",
              createdAt: "2026-08-08T00:00:00.000Z",
              updatedAt: "2026-08-08T00:00:00.000Z",
              channel: null,
              repo: { id: "repo-1", name: "trace" },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(run(["session", "start", "hello", "--repo", "repo-1", "--json"])).resolves.toBe(0);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });
});
