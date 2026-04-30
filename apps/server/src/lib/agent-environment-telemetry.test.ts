import { describe, expect, it, vi } from "vitest";
import {
  logAgentEnvironmentTelemetry,
  redactTelemetryData,
} from "./agent-environment-telemetry.js";

describe("agent environment telemetry", () => {
  it("redacts token, secret, authorization, and signature values recursively", () => {
    expect(
      redactTelemetryData({
        authorization: "Bearer launcher-secret",
        runtimeToken: "runtime-token",
        runtimeError:
          "bridge rejected eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXNzaW9uSWQiOiJzZXNzaW9uLTEiLCJydW50aW1lSWQiOiJydW50aW1lLTEifQ.EU7b8o8K6M7_HyphenSafeSignatureValue",
        nested: {
          secretId: "secret-1",
          message: "failed with Bearer raw-secret and v1=abcdef1234567890abcdef1234567890",
        },
        values: [{ traceSignature: "v1=abcdef1234567890abcdef1234567890" }],
      }),
    ).toEqual({
      authorization: "[redacted]",
      runtimeToken: "[redacted]",
      runtimeError: "bridge rejected [redacted]",
      nested: {
        secretId: "[redacted]",
        message: "failed with Bearer [redacted] and v1=[redacted]",
      },
      values: [{ traceSignature: "[redacted]" }],
    });
  });

  it("does not log bearer tokens or runtime JWTs from error strings", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const runtimeToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXNzaW9uSWQiOiJzZXNzaW9uLTEiLCJydW50aW1lSWQiOiJydW50aW1lLTEifQ.EU7b8o8K6M7_HyphenSafeSignatureValue";
    try {
      logAgentEnvironmentTelemetry("provisioned.start_failed", {
        error: `launcher returned Bearer launcher-secret for ${runtimeToken}`,
      });
      const logged = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(logged).not.toContain("launcher-secret");
      expect(logged).not.toContain(runtimeToken);
      expect(logged).toContain("Bearer [redacted]");
      expect(logged).toContain("[redacted]");
    } finally {
      logSpy.mockRestore();
    }
  });
});
