import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("loads required Kubernetes launcher config", () => {
    const config = loadConfig({
      TRACE_LAUNCHER_BEARER_TOKEN: "launcher-token",
      K8S_NAMESPACE: "trace",
      TRACE_RUNTIME_IMAGE: "registry.example.com/runtime:latest",
      TRACE_RUNTIME_SERVICE_ACCOUNT: "trace-runtime",
      TRACE_RUNTIME_CPU_REQUEST: "500m",
      TRACE_RUNTIME_MEMORY_REQUEST: "1Gi",
      TRACE_RUNTIME_CPU_LIMIT: "2",
      TRACE_RUNTIME_MEMORY_LIMIT: "4Gi",
      TRACE_RUNTIME_IMAGE_PULL_SECRET_NAMES: "regcred",
      TRACE_RUNTIME_ENV_SECRET_NAMES: "trace-runtime-tool-secrets",
      TRACE_RUNTIME_PASSTHROUGH_ENV: "OPENAI_API_KEY",
      OPENAI_API_KEY: "token",
      PORT: "9000",
    });

    expect(config).toMatchObject({
      port: 9000,
      traceLauncherBearerToken: "launcher-token",
      namespace: "trace",
      traceRuntimeImage: "registry.example.com/runtime:latest",
      runtimeServiceAccount: "trace-runtime",
      runtimeCpuRequest: "500m",
      runtimeMemoryRequest: "1Gi",
      runtimeCpuLimit: "2",
      runtimeMemoryLimit: "4Gi",
      runtimeImagePullSecretNames: ["regcred"],
      runtimeEnvSecretNames: ["trace-runtime-tool-secrets"],
      runtimePassthroughEnv: { OPENAI_API_KEY: "token" },
    });
  });

  it("rejects missing required config", () => {
    expect(() => loadConfig({})).toThrow("TRACE_LAUNCHER_BEARER_TOKEN");
  });
});
