import { delimiter } from "path";
import { describe, expect, it } from "vitest";
import { buildTraceInvocationEnv } from "../src/trace-invocation-env.js";

describe("buildTraceInvocationEnv", () => {
  it("builds the complete desktop artifact capability environment", () => {
    const env = buildTraceInvocationEnv({
      runtimeEnv: {
        TRACE_INVOCATION_TOKEN: "invocation-token",
        TRACE_API_URL: "https://untrusted.example",
        TRACE_SERVER_URL: "https://other-control-plane.example",
        TRACE_SKILLS_DIR: "/untrusted/skills",
        PATH: "/untrusted/bin",
      },
      serverUrl: "wss://trace.example/bridge?bridgeAuthToken=secret",
      skillsDir: "/trace/runtime/skills",
      binDir: "/trace/runtime/bin",
      nodeBinary: "/trace/node",
      basePath: "/usr/bin",
      electronRunAsNode: true,
    });

    expect(env).toMatchObject({
      TRACE_API_URL: "https://trace.example/",
      TRACE_SERVER_URL: "https://trace.example/",
      TRACE_CLI: "/trace/runtime/bin/trace",
      TRACE_INVOCATION_TOKEN: "invocation-token",
      TRACE_SKILLS_DIR: "/trace/runtime/skills",
      TRACE_NODE_BINARY: "/trace/node",
      TRACE_ELECTRON_RUN_AS_NODE: "1",
      PATH: ["/trace/runtime/bin", "/usr/bin"].join(delimiter),
    });
  });
});
