import type { ControllerConfig } from "./config.js";
import type { StartSessionRequest } from "./types.js";

export const configFixture: ControllerConfig = {
  port: 8787,
  traceLauncherBearerToken: "launcher-token",
  namespace: "trace-runtimes",
  traceRuntimeImage: "registry.example.com/trace-agent-runtime:latest",
  runtimeServiceAccount: "trace-runtime",
  runtimeCpuRequest: "1",
  runtimeMemoryRequest: "2Gi",
  runtimeCpuLimit: "4",
  runtimeMemoryLimit: "8Gi",
  runtimeImagePullSecretNames: [],
  runtimeEnvSecretNames: [],
  runtimePassthroughEnv: {
    OPENAI_API_KEY: "openai-token",
  },
};

export const startSessionRequestFixture: StartSessionRequest = {
  sessionId: "sess-123",
  sessionGroupId: "group-123",
  orgId: "org-123",
  runtimeInstanceId: "runtime-abc123",
  runtimeToken: "runtime-token",
  runtimeTokenExpiresAt: "2026-05-07T12:00:00.000Z",
  runtimeTokenScope: "session",
  bridgeUrl: "wss://trace.example.com/bridge",
  repo: {
    id: "repo-1",
    name: "trace",
    remoteUrl: "https://github.com/example/trace.git",
    defaultBranch: "main",
    branch: "feature/test",
    checkpointSha: null,
    readOnly: false,
  },
  tool: "codex",
  model: "gpt-5",
  reasoningEffort: "high",
  bootstrapEnv: {
    TRACE_SESSION_ID: "sess-123",
    TRACE_ORG_ID: "org-123",
    TRACE_RUNTIME_INSTANCE_ID: "runtime-abc123",
    TRACE_RUNTIME_TOKEN: "runtime-token",
    TRACE_BRIDGE_URL: "wss://trace.example.com/bridge",
  },
  metadata: {
    requestedBy: "user-1",
    environmentId: "env-1",
    launcherMetadata: {},
  },
};
