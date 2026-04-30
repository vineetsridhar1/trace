import { describe, expect, it } from "vitest";
import { buildMachineEnv, buildMachineName } from "./fly.js";
import type { StartSessionRequest } from "./types.js";

describe("Fly machine helpers", () => {
  it("builds deterministic Fly machine names", () => {
    expect(buildMachineName("session-abcdef123456789", "runtime-987654321")).toBe(
      "trace-session-abcd-runtime-9876",
    );
  });

  it("injects Trace and repo environment variables", () => {
    expect(
      buildMachineEnv(startRequest(), {
        GITHUB_TOKEN: "github-token",
        OPENAI_API_KEY: "openai-key",
      }),
    ).toMatchObject({
      GITHUB_TOKEN: "github-token",
      OPENAI_API_KEY: "openai-key",
      TRACE_SESSION_ID: "session-1",
      TRACE_ORG_ID: "org-1",
      TRACE_RUNTIME_INSTANCE_ID: "runtime-1",
      TRACE_RUNTIME_TOKEN: "runtime-token",
      TRACE_BRIDGE_URL: "wss://trace.example/bridge",
      TRACE_TOOL: "codex",
      TRACE_MODEL: "gpt-5",
      TRACE_REPO_URL: "https://github.com/example/repo.git",
      TRACE_REPO_BRANCH: "feature/test",
    });
  });
});

function startRequest(): StartSessionRequest {
  return {
    sessionId: "session-1",
    sessionGroupId: null,
    orgId: "org-1",
    runtimeInstanceId: "runtime-1",
    runtimeToken: "runtime-token",
    runtimeTokenExpiresAt: "2026-01-01T00:00:00.000Z",
    runtimeTokenScope: "session",
    bridgeUrl: "wss://trace.example/bridge",
    repo: {
      id: "repo-1",
      name: "repo",
      remoteUrl: "https://github.com/example/repo.git",
      defaultBranch: "main",
      branch: "feature/test",
      checkpointSha: null,
      readOnly: false,
    },
    tool: "codex",
    model: "gpt-5",
    bootstrapEnv: {
      TRACE_SESSION_ID: "session-1",
      TRACE_ORG_ID: "org-1",
      TRACE_RUNTIME_INSTANCE_ID: "runtime-1",
      TRACE_RUNTIME_TOKEN: "runtime-token",
      TRACE_BRIDGE_URL: "wss://trace.example/bridge",
    },
    metadata: {
      requestedBy: "user-1",
      environmentId: "env-1",
      launcherMetadata: {},
    },
  };
}
