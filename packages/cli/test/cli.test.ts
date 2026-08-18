import { traceCliOperations } from "@trace/cli-contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TraceClient } from "../src/client.js";
import { commandGroups, commands } from "../src/commands/index.js";
import { run } from "../src/main.js";

describe("Trace CLI", () => {
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "");
    vi.stubEnv("TRACE_SESSION_ID", "");
    vi.stubEnv("TRACE_SESSION_GROUP_ID", "");
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
    const globalOutput = stdout.mock.calls.flat().join("");
    expect(globalOutput).toContain("Command groups:");
    expect(globalOutput).toContain("integration");
    expect(globalOutput).not.toContain("session start");

    stdout.mockClear();
    await expect(run(["integration", "--help"])).resolves.toBe(0);
    const groupOutput = stdout.mock.calls.flat().join("");
    expect(groupOutput).toContain('Usage: "$TRACE_CLI" integration <command>');
    expect(groupOutput).toContain("integration list --json");
    expect(groupOutput).toContain("Put provider requests in generated Node routes");

    stdout.mockClear();
    await expect(run(["session", "start", "--help"])).resolves.toBe(0);
    const output = stdout.mock.calls.flat().join("");
    expect(output).toContain('Usage: "$TRACE_CLI" session start');
    expect(output).toContain("Start a new session group");
  });

  it("exposes the command registry as machine-readable help", async () => {
    await expect(run(["--help", "--json"])).resolves.toBe(0);
    expect(JSON.parse(stdout.mock.calls.flat().join(""))).toMatchObject({
      groups: expect.arrayContaining([
        expect.objectContaining({
          name: "integration",
          usage: '"$TRACE_CLI" integration <command> [options]',
        }),
      ]),
    });

    stdout.mockClear();
    await expect(run(["integration", "--help", "--json"])).resolves.toBe(0);
    expect(JSON.parse(stdout.mock.calls.flat().join(""))).toMatchObject({
      group: {
        name: "integration",
        workflow: expect.arrayContaining([expect.stringContaining("integration list --json")]),
        commands: expect.arrayContaining([
          expect.objectContaining({ path: ["integration", "add"] }),
        ]),
      },
    });

    stdout.mockClear();
    await expect(run(["session", "start", "--help", "--json"])).resolves.toBe(0);
    expect(JSON.parse(stdout.mock.calls.flat().join(""))).toMatchObject({
      command: { path: ["session", "start"] },
    });

    stdout.mockClear();
    await expect(run(["integration", "add", "--help", "--json"])).resolves.toBe(0);
    expect(JSON.parse(stdout.mock.calls.flat().join(""))).toMatchObject({
      command: {
        path: ["integration", "add"],
        examples: expect.arrayContaining([expect.stringContaining("--capabilities profile")]),
        effects: expect.arrayContaining([expect.stringContaining("current app")]),
        output: expect.stringContaining("selected capability guides"),
        nextSteps: expect.arrayContaining([expect.stringContaining("generated Node route")]),
      },
    });
  });

  it("links a pull request to the current session", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_ID", "session-1");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          operationName: string;
          variables: Record<string, unknown>;
        };
        expect(request.operationName).toBe("TraceCliLinkSessionPullRequest");
        expect(request.variables).toEqual({
          sessionId: "session-1",
          prUrl: "https://github.com/acme/app/pull/42",
        });
        return new Response(
          JSON.stringify({
            data: {
              linkSessionPullRequest: {
                id: "group-1",
                name: "Feature work",
                status: "in_review",
                prUrl: "https://github.com/acme/app/pull/42",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    await expect(
      run(["session", "link-pr", "https://github.com/acme/app/pull/42", "--self", "--json"]),
    ).resolves.toBe(0);
    expect(stdout.mock.calls.flat().join("")).toContain(
      '"prUrl":"https://github.com/acme/app/pull/42"',
    );
  });

  it("prints repository reconciliation commands when PR linking requires them", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_ID", "session-1");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              errors: [
                {
                  message:
                    'Repository association is required. Run "$TRACE_CLI" repo attach-remote repo-1 https://github.com/acme/app.git --json',
                  extensions: { code: "BAD_USER_INPUT" },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(
      run(["session", "link-pr", "https://github.com/acme/app/pull/42", "--self", "--json"]),
    ).resolves.toBe(4);
    expect(stderr.mock.calls.flat().join("")).toContain('"category":"validation"');
    expect(stderr.mock.calls.flat().join("")).toContain("repo attach-remote repo-1");
  });

  it("links a repository to a repo-less channel", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          operationName: string;
          variables: Record<string, unknown>;
        };
        expect(request.operationName).toBe("TraceCliLinkChannelRepo");
        expect(request.variables).toEqual({
          channelId: "channel-1",
          repoId: "repo-1",
          baseBranch: "develop",
        });
        return new Response(
          JSON.stringify({
            data: {
              linkChannelRepo: {
                id: "channel-1",
                name: "Project",
                baseBranch: "develop",
                repo: {
                  id: "repo-1",
                  name: "app",
                  remoteUrl: null,
                  defaultBranch: "main",
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    await expect(
      run(["channel", "link-repo", "channel-1", "repo-1", "--branch", "develop", "--json"]),
    ).resolves.toBe(0);
    expect(stdout.mock.calls.flat().join("")).toContain('"baseBranch":"develop"');
  });

  it("attaches a remote URL to a local-only repository", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          operationName: string;
          variables: Record<string, unknown>;
        };
        expect(request.operationName).toBe("TraceCliAttachRepoRemote");
        expect(request.variables).toEqual({
          repoId: "repo-1",
          remoteUrl: "https://github.com/acme/app.git",
        });
        return new Response(
          JSON.stringify({
            data: {
              attachRepoRemote: {
                id: "repo-1",
                name: "app",
                provider: "github",
                remoteUrl: "https://github.com/acme/app.git",
                defaultBranch: "main",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    await expect(
      run(["repo", "attach-remote", "repo-1", "https://github.com/acme/app.git", "--json"]),
    ).resolves.toBe(0);
    expect(stdout.mock.calls.flat().join("")).toContain(
      '"remoteUrl":"https://github.com/acme/app.git"',
    );
  });

  it("documents every command and group with actionable help metadata", () => {
    for (const command of commands) {
      expect(command.examples?.length, `${command.path.join(" ")} examples`).toBeGreaterThan(0);
      expect(command.effects?.length, `${command.path.join(" ")} effects`).toBeGreaterThan(0);
      expect(command.output, `${command.path.join(" ")} output`).toBeTruthy();
      expect(command.nextSteps?.length, `${command.path.join(" ")} next steps`).toBeGreaterThan(0);
    }
    for (const group of commandGroups) {
      expect(group.workflow?.length, `${group.name} workflow`).toBeGreaterThan(0);
      expect(group.examples?.length, `${group.name} examples`).toBeGreaterThan(0);
    }
  });

  it("opens a browser tab in the current session group", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_GROUP_ID", "group-1");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test");
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        operationName: string;
        variables: Record<string, unknown>;
      };
      expect(request.operationName).toBe("TraceCliOpenWorkspaceBrowser");
      expect(request.variables).toEqual({
        sessionGroupId: "group-1",
        url: "example.com",
      });
      return new Response(JSON.stringify({ data: { openWorkspaceBrowser: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(run(["browser", "open", "example.com", "--json"])).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("opens a terminal tab and sends an optional command without echoing it", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_ID", "session-1");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test");
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        operationName: string;
        variables: Record<string, unknown>;
      };
      if (request.operationName === "TraceCliOpenTerminal") {
        return new Response(
          JSON.stringify({
            data: {
              createTerminal: {
                id: "terminal-1",
                sessionId: "session-1",
                status: "active",
                cols: 80,
                rows: 24,
                connected: true,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      expect(request.operationName).toBe("TraceCliSendTerminalInput");
      expect(request.variables).toEqual({ terminalId: "terminal-1", data: "pnpm test\r" });
      return new Response(JSON.stringify({ data: { sendTerminalInput: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(run(["terminal", "open", "pnpm test", "--json"])).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const output = stdout.mock.calls.flat().join("");
    expect(output).toContain('"commandSent":true');
    expect(output).not.toContain("pnpm test");
  });

  it("submits explicit app deployment facts without analyzing the project", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_GROUP_ID", "group-app");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        query: string;
        variables: { input: Record<string, unknown> };
      };
      expect(request.query).toContain("TraceCliDeployAppSession");
      expect(request.variables.input).toMatchObject({
        sessionGroupId: "group-app",
        target: "service",
        buildCommand: "pnpm build",
        startCommand: "pnpm start",
        port: 3000,
        healthPath: "/health",
        database: true,
        migrationCommand: "pnpm db:migrate",
      });
      return new Response(
        JSON.stringify({
          data: {
            deployAppSession: {
              id: "deployment-1",
              status: "queued",
              target: "service",
              commitSha: "a".repeat(40),
              url: null,
              errorMessage: null,
              queuedAt: "2026-08-11T00:00:00.000Z",
              updatedAt: "2026-08-11T00:00:00.000Z",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      run([
        "app",
        "deploy",
        "--target",
        "service",
        "--build-command",
        "pnpm build",
        "--start-command",
        "pnpm start",
        "--port",
        "3000",
        "--health-path",
        "/health",
        "--database",
        "--migration-command",
        "pnpm db:migrate",
        "--json",
      ]),
    ).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(stdout.mock.calls.flat().join("")).toContain('"status":"queued"');
  });

  it("forwards an arbitrary cloud-session port independently of application config", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_GROUP_ID", "group-app");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          operationName: string;
          variables: Record<string, unknown>;
        };
        expect(request.operationName).toBe("TraceCliForwardSessionPort");
        expect(request.variables).toEqual({
          sessionGroupId: "group-app",
          port: 4321,
          label: "Arbitrary server",
          accessMode: "public",
        });
        return new Response(
          JSON.stringify({
            data: {
              forwardSessionPort: {
                id: "endpoint-1",
                url: "https://endpoint.example.test",
                label: "Arbitrary server",
                targetPort: 4321,
                status: "enabled",
                accessMode: "public",
                source: "manual",
                appConfigId: null,
                processConfigId: null,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    await expect(
      run(["port", "forward", "4321", "--label", "Arbitrary server", "--json"]),
    ).resolves.toBe(0);
    expect(stdout.mock.calls.flat().join("")).toContain("https://endpoint.example.test");
  });

  it("controls a configured cloud-session application process", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_GROUP_ID", "group-app");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          operationName: string;
          variables: Record<string, unknown>;
        };
        expect(request.operationName).toBe("TraceCliStartSessionProcess");
        expect(request.variables).toEqual({
          sessionGroupId: "group-app",
          appConfigId: "web",
          processConfigId: "dev",
        });
        return new Response(
          JSON.stringify({
            data: {
              startSessionProcess: {
                id: "process-1",
                appConfigId: "web",
                processConfigId: "dev",
                label: "Dev server",
                status: "starting",
                endpoints: [],
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    await expect(run(["app", "start", "web", "dev", "--json"])).resolves.toBe(0);
    expect(stdout.mock.calls.flat().join("")).toContain('"status":"starting"');
  });

  it("prints complete deployment failure details from app status", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_GROUP_ID", "group-app");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                appDeployments: [
                  {
                    id: "deployment-1",
                    status: "failed",
                    target: "service",
                    commitSha: "a".repeat(40),
                    url: null,
                    errorMessage: "CodeBuild failed: pnpm install exited with code 1",
                    queuedAt: "2026-08-11T00:00:00.000Z",
                    updatedAt: "2026-08-11T00:01:00.000Z",
                  },
                ],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(run(["app", "status", "--json"])).resolves.toBe(0);
    expect(JSON.parse(stdout.mock.calls.flat().join(""))).toEqual({
      deployments: [
        expect.objectContaining({
          status: "failed",
          errorMessage: "CodeBuild failed: pnpm install exited with code 1",
        }),
      ],
    });
  });

  it("surfaces app deploy validation errors with a failing exit code", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_GROUP_ID", "group-app");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              errors: [
                {
                  message:
                    "Persistent PostgreSQL is not enabled for published apps in this environment",
                  extensions: { code: "BAD_USER_INPUT" },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(
      run([
        "app",
        "deploy",
        "--target",
        "service",
        "--start-command",
        "pnpm start",
        "--database",
        "--json",
      ]),
    ).resolves.toBe(4);
    expect(JSON.parse(stderr.mock.calls.flat().join(""))).toEqual({
      error: {
        category: "validation",
        message: "Persistent PostgreSQL is not enabled for published apps in this environment",
      },
    });
  });

  it("starts a new group in the current session destination without exposing the bearer", async () => {
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
        variables: Record<string, unknown>;
      };
      if (request.query.includes("TraceCliStartContextSession")) {
        expect(request.variables).toEqual({ id: "session-1" });
        return new Response(
          JSON.stringify({
            data: {
              session: {
                id: "session-1",
                tool: "claude_code",
                model: "claude-sonnet-4-5",
                reasoningEffort: "high",
                hosting: "local",
                channel: {
                  id: "channel-1",
                  name: "API",
                  repo: { id: "repo-1", name: "trace" },
                },
                repo: { id: "repo-1", name: "trace" },
                connection: { environmentId: "environment-1", runtimeInstanceId: "runtime-1" },
                sessionGroup: { kind: "coding", visibility: "private" },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      expect(request.query).not.toContain("projects {");
      expect(request.variables.input).toMatchObject({
        clientMutationId: expect.any(String),
        channelId: "channel-1",
        repoId: "repo-1",
        prompt: "Implement the API tests",
        kind: "coding",
        visibility: "private",
        tool: "claude_code",
        model: "claude-sonnet-4-5",
        reasoningEffort: "high",
        hosting: "local",
        environmentId: "environment-1",
      });
      expect(request.variables.input).not.toHaveProperty("runtimeInstanceId");
      expect(request.variables.input).not.toHaveProperty("sessionGroupId");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer injected-agent-secret");
      return new Response(
        JSON.stringify({
          data: {
            startSession: {
              id: "session-2",
              name: "API tests",
              agentStatus: "active",
              sessionStatus: "in_progress",
              tool: "claude_code",
              model: "claude-sonnet-4-5",
              reasoningEffort: "high",
              hosting: "local",
              branch: "trace-api-tests",
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
      run(["session", "start", "Implement", "the", "API", "tests", "--json"]),
    ).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stdout.mock.calls.flat().join("")).toContain('"id":"session-2"');
    expect(stdout.mock.calls.flat().join("")).toContain('"runRequested":true');
    expect(stdout.mock.calls.flat().join("")).toContain(
      '"uiPath":"/c/channel-1/g/group-2/s/session-2"',
    );
    expect(stdout.mock.calls.flat().join("")).not.toContain("injected-agent-secret");
  });

  it("rejects group-level configuration when joining an explicit group", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_ID", "session-1");
    vi.stubEnv("TRACE_SESSION_GROUP_ID", "group-1");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      run(["session", "start", "hello", "--group", "group-1", "--hosting", "local", "--json"]),
    ).resolves.toBe(64);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.mock.calls.flat().join("")).toContain("sessions inherit those settings");
  });

  it("requires a task prompt before starting a session", async () => {
    await expect(run(["session", "start", "--json"])).resolves.toBe(64);
    expect(stderr.mock.calls.flat().join("")).toContain("A task prompt is required");
    expect(stderr.mock.calls.flat().join("")).toContain("--prompt");
  });

  it("requires a channel instead of accepting a repository-only coding destination", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      run(["session", "start", "Implement", "the", "API", "tests", "--repo", "repo-1", "--json"]),
    ).resolves.toBe(64);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.mock.calls.flat().join("")).toContain("A channel is required");
    expect(stderr.mock.calls.flat().join("")).toContain("channel list --member-only");
  });

  it("explains how to provide missing session message text", async () => {
    await expect(run(["session", "send", "session-1", "--json"])).resolves.toBe(64);
    expect(stderr.mock.calls.flat().join("")).toContain("A message is required");
    expect(stderr.mock.calls.flat().join("")).toContain("--self");
  });

  it("joins a session group only when --group is explicit", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_GROUP_ID", "group-current");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        variables: { input: Record<string, unknown> };
      };
      expect(request.variables.input).toMatchObject({
        sessionGroupId: "group-target",
        prompt: "Review this",
      });
      return new Response(
        JSON.stringify({
          data: {
            startSession: {
              id: "session-2",
              name: "Review this",
              agentStatus: "not_started",
              tool: "codex",
              sessionGroupId: "group-target",
              channel: null,
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      run(["session", "start", "Review", "this", "--group", "group-target", "--json"]),
    ).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(stdout.mock.calls.flat().join("")).toContain('"uiPath":"/g/group-target/s/session-2"');
  });

  it("does not inherit a coding runtime when an explicit generated kind needs its own runtime", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_ID", "session-1");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        query: string;
        variables: Record<string, unknown>;
      };
      if (request.query.includes("TraceCliStartContextSession")) {
        return new Response(
          JSON.stringify({
            data: {
              session: {
                id: "session-1",
                tool: "codex",
                model: null,
                reasoningEffort: null,
                hosting: "local",
                channel: { id: "channel-1", name: "API", repo: null },
                repo: null,
                connection: { environmentId: "local-environment", runtimeInstanceId: "runtime-1" },
                sessionGroup: { kind: "coding", visibility: "public" },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      expect(request.variables.input).toMatchObject({ kind: "app", tool: "codex" });
      expect(request.variables.input).not.toHaveProperty("hosting");
      expect(request.variables.input).not.toHaveProperty("environmentId");
      expect(request.variables.input).not.toHaveProperty("runtimeInstanceId");
      return new Response(
        JSON.stringify({
          data: {
            startSession: {
              id: "session-app",
              name: "Build an app",
              agentStatus: "not_started",
              tool: "codex",
              sessionGroupId: "group-app",
              channel: null,
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      run(["session", "start", "Build", "an", "app", "--kind", "app", "--json"]),
    ).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it("requires an explicit repo when a selected channel has none", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
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
    expect(stderr.mock.calls.flat().join("")).toContain("has no linked repository");
  });

  it("converts the current session using the selected channel repository", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_ID", "session-general");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        query: string;
        variables: Record<string, unknown>;
      };
      if (request.query.includes("TraceCliSession")) {
        return new Response(
          JSON.stringify({
            data: {
              session: {
                id: "session-general",
                sessionGroupId: "group-general",
                channel: null,
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (request.query.includes("TraceCliStartChannel")) {
        return new Response(
          JSON.stringify({
            data: {
              channel: {
                id: "channel-1",
                name: "API",
                repo: { id: "repo-1", name: "trace" },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      expect(request.variables.input).toEqual({
        sessionGroupId: "group-general",
        kind: "coding",
        channelId: "channel-1",
        repoId: "repo-1",
        tool: "codex",
      });
      return new Response(
        JSON.stringify({
          data: {
            convertSessionGroup: {
              id: "session-general",
              name: "Build the API",
              agentStatus: "active",
              sessionStatus: "in_progress",
              tool: "codex",
              model: null,
              reasoningEffort: null,
              hosting: "local",
              branch: null,
              sessionGroupId: "group-general",
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
      run(["session", "convert", "--channel", "channel-1", "--tool", "codex", "--json"]),
    ).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(stdout.mock.calls.flat().join("")).toContain('"id":"session-general"');
  });

  it("rejects coding conversion when the project channel has no repository", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_ID", "session-general");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { query: string };
      const data = request.query.includes("TraceCliSession")
        ? {
            session: {
              id: "session-general",
              sessionGroupId: "group-general",
              channel: { id: "channel-1", name: "Project" },
            },
          }
        : { channel: { id: "channel-1", name: "Project", repo: null } };
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(run(["session", "convert", "--json"])).resolves.toBe(64);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stderr.mock.calls.flat().join("")).toContain(
      "channel link-repo channel-1 <repo-id> --json",
    );
  });

  it.each(["app", "design", "pdf", "animation"] as const)(
    "converts the current session to a managed %s workspace",
    async (kind) => {
      vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
      vi.stubEnv("TRACE_SESSION_ID", "session-general");
      vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
      vi.stubEnv("TRACE_API_URL", "https://trace.test/");
      const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          query: string;
          variables: Record<string, unknown>;
        };
        if (request.query.includes("TraceCliSession")) {
          return new Response(
            JSON.stringify({
              data: {
                session: {
                  id: "session-general",
                  sessionGroupId: "group-general",
                  channel: null,
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        expect(request.variables.input).toEqual({
          sessionGroupId: "group-general",
          kind,
          tool: "codex",
        });
        return new Response(
          JSON.stringify({
            data: {
              convertSessionGroup: {
                id: "session-general",
                name: "Create something",
                agentStatus: "active",
                sessionStatus: "in_progress",
                tool: "codex",
                model: null,
                reasoningEffort: null,
                hosting: "cloud",
                branch: "main",
                sessionGroupId: "group-general",
                createdAt: "2026-08-08T00:00:00.000Z",
                updatedAt: "2026-08-08T00:00:00.000Z",
                channel: null,
                repo: { id: "managed-repo-1", name: "Create something source" },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        run(["session", "convert", "--kind", kind, "--tool", "codex", "--json"]),
      ).resolves.toBe(0);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(stdout.mock.calls.flat().join("")).toContain('"hosting":"cloud"');
    },
  );

  it("requires a channel when converting a general session", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_SESSION_ID", "session-general");
    vi.stubEnv("TRACE_ORGANIZATION_ID", "org-1");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            session: {
              id: "session-general",
              sessionGroupId: "group-general",
              channel: null,
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(run(["session", "convert", "--kind", "coding", "--json"])).resolves.toBe(64);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(stderr.mock.calls.flat().join("")).toContain("A coding channel is required");
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

    await expect(run(["session", "start", "hello", "--kind", "app", "--json"])).resolves.toBe(0);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("retries artifact uploads with the caller-visible idempotency key", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    const keys: string[] = [];
    const fetchMock = vi.fn(async (_url: URL, init?: RequestInit) => {
      keys.push(new Headers(init?.headers).get("X-Trace-Idempotency-Key") ?? "");
      if (keys.length === 1) throw new Error("response lost");
      return new Response(JSON.stringify({ artifact: { id: "artifact-1" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      run([
        "artifact",
        "push",
        "file-bundle",
        "package.json",
        "--idempotency-key",
        "artifact-key-1",
        "--json",
      ]),
    ).resolves.toBe(0);
    expect(keys).toEqual(["artifact-key-1", "artifact-key-1"]);
    expect(stdout.mock.calls.flat().join("")).toContain('"idempotencyKey":"artifact-key-1"');
  });

  it("classifies rejected artifact bundles as validation errors", async () => {
    vi.stubEnv("TRACE_INVOCATION_TOKEN", "injected-agent-secret");
    vi.stubEnv("TRACE_API_URL", "https://trace.test/");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Invalid artifact manifest" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(run(["artifact", "push", "file-bundle", "package.json", "--json"])).resolves.toBe(
      4,
    );
    expect(stderr.mock.calls.flat().join("")).toContain('"category":"validation"');
  });

  it("surfaces graphql-transport-ws operation errors", async () => {
    class FakeWebSocket {
      private listeners = new Map<string, Array<(event: { data?: string }) => void>>();

      constructor() {
        queueMicrotask(() => this.emit("open", {}));
      }

      addEventListener(type: string, listener: (event: { data?: string }) => void) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      send(raw: string) {
        const message = JSON.parse(raw) as { type?: string };
        if (message.type === "connection_init") {
          this.emit("message", { data: JSON.stringify({ type: "connection_ack" }) });
        } else if (message.type === "subscribe") {
          this.emit("message", {
            data: JSON.stringify({
              id: "trace-cli",
              type: "error",
              payload: [{ message: "Nested field denied", extensions: { code: "FORBIDDEN" } }],
            }),
          });
        }
      }

      close() {
        this.emit("close", {});
      }

      private emit(type: string, event: { data?: string }) {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
      }
    }
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const client = new TraceClient("https://trace.test", "token", "org-1");

    await expect(
      client.subscribe(traceCliOperations.followSession, {}, () => undefined),
    ).rejects.toMatchObject({ message: "Nested field denied", category: "authorization" });
  });

  it("reports a rejected subscription handshake as authentication failure", async () => {
    class RejectedWebSocket {
      private listeners = new Map<
        string,
        Array<(event: { code?: number; reason?: string }) => void>
      >();

      constructor() {
        queueMicrotask(() => this.emit("open", {}));
      }

      addEventListener(
        type: string,
        listener: (event: { code?: number; reason?: string }) => void,
      ) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      send(raw: string) {
        const message = JSON.parse(raw) as { type?: string };
        if (message.type === "connection_init") {
          queueMicrotask(() => this.emit("close", { code: 4403, reason: "Forbidden" }));
        }
      }

      close() {}

      private emit(type: string, event: { code?: number; reason?: string }) {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
      }
    }
    vi.stubGlobal("WebSocket", RejectedWebSocket);
    const client = new TraceClient("https://trace.test", "expired-token", "org-1");

    await expect(
      client.subscribe(traceCliOperations.followSession, {}, () => undefined),
    ).rejects.toMatchObject({ category: "authentication", exitCode: 2 });
  });

  it("times out a subscription handshake that is never acknowledged", async () => {
    vi.useFakeTimers();
    class SilentWebSocket {
      private listeners = new Map<string, Array<(event: { code?: number }) => void>>();

      constructor() {
        queueMicrotask(() => this.emit("open", {}));
      }

      addEventListener(type: string, listener: (event: { code?: number }) => void) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
      }

      send() {}
      close() {
        this.emit("close", { code: 1000 });
      }

      private emit(type: string, event: { code?: number }) {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
      }
    }
    vi.stubGlobal("WebSocket", SilentWebSocket);
    const client = new TraceClient("https://trace.test", "token", "org-1");
    const subscription = client.subscribe(traceCliOperations.followSession, {}, () => undefined);
    const rejection = expect(subscription).rejects.toMatchObject({
      category: "connectivity",
      exitCode: 5,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    vi.useRealTimers();
  });
});
