import { describe, expect, it } from "vitest";
import { validateStartSessionRequest } from "./validation.js";
import type { StartSessionRequest } from "./types.js";

describe("validateStartSessionRequest", () => {
  it("accepts Trace payloads without launcher metadata or model", () => {
    const request = validateStartSessionRequest({
      ...startRequest(),
      model: null,
      metadata: {
        requestedBy: "user-1",
        environmentId: "env-1",
        launcherMetadata: null,
      },
    });

    expect(request.model).toBeNull();
    expect(request.reasoningEffort).toBe("xhigh");
    expect(request.metadata.launcherMetadata).toEqual({});
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
    repo: null,
    tool: "codex",
    model: "gpt-5",
    reasoningEffort: "xhigh",
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
