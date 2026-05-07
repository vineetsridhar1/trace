import { describe, expect, it } from "vitest";
import {
  buildJobName,
  buildRuntimeEnv,
  buildRuntimeJob,
  buildRuntimeTokenSecret,
} from "./kubernetes.js";
import { configFixture, startSessionRequestFixture } from "./test-fixtures.js";

describe("Kubernetes runtime manifests", () => {
  it("builds deterministic safe job names", () => {
    expect(buildJobName("runtime_abc123")).toBe("trace-runtime-runtimeabc123");
    expect(buildJobName("!!!")).toBe("trace-runtime-runtime");
  });

  it("injects runtime token from a Secret instead of plain env", () => {
    const env = buildRuntimeEnv(configFixture, startSessionRequestFixture, "runtime-token-secret");
    const names = env.map((item) => item.name);

    expect(names).toContain("TRACE_RUNTIME_TOKEN");
    expect(names).toContain("TRACE_BRIDGE_URL");
    expect(names).toContain("OPENAI_API_KEY");
    expect(names).toContain("TRACE_TOOL");
    expect(env.find((item) => item.name === "TRACE_RUNTIME_TOKEN")).toMatchObject({
      valueFrom: {
        secretKeyRef: {
          name: "runtime-token-secret",
          key: "runtime-token",
        },
      },
    });
    expect(env.find((item) => item.name === "TRACE_RUNTIME_TOKEN")?.value).toBeUndefined();
  });

  it("builds a namespace-scoped Job with Trace labels", () => {
    const config = {
      ...configFixture,
      runtimeImagePullSecretNames: ["regcred"],
      runtimeEnvSecretNames: ["trace-runtime-tool-secrets"],
    };
    const job = buildRuntimeJob(
      config,
      "trace-runtime-runtimeabc123",
      "runtime-token-secret",
      startSessionRequestFixture,
      "session:sess-123:start",
    );

    expect(job.metadata).toMatchObject({
      name: "trace-runtime-runtimeabc123",
      namespace: "trace-runtimes",
      labels: {
        "app.kubernetes.io/name": "trace-runtime",
        "trace.trace.dev/session-id": "sess-123",
        "trace.trace.dev/org-id": "org-123",
        "trace.trace.dev/runtime-id": "trace-runtime-runtimeabc123",
      },
      annotations: {
        "trace.trace.dev/idempotency-key": "session:sess-123:start",
      },
    });
    expect(job.spec?.template.spec?.restartPolicy).toBe("Never");
    expect(job.spec?.template.spec?.imagePullSecrets).toEqual([{ name: "regcred" }]);
    expect(job.spec?.template.spec?.containers[0]?.image).toBe(config.traceRuntimeImage);
    expect(job.spec?.template.spec?.containers[0]?.envFrom).toEqual([
      { secretRef: { name: "trace-runtime-tool-secrets" } },
    ]);
  });

  it("builds a runtime token Secret", () => {
    expect(buildRuntimeTokenSecret("trace", "runtime-token-secret", "token")).toMatchObject({
      metadata: {
        name: "runtime-token-secret",
        namespace: "trace",
      },
      stringData: {
        "runtime-token": "token",
      },
    });
  });
});
