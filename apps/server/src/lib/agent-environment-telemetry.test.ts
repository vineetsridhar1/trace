import { describe, expect, it } from "vitest";
import { redactTelemetryData } from "./agent-environment-telemetry.js";

describe("agent environment telemetry", () => {
  it("redacts token, secret, authorization, and signature values recursively", () => {
    expect(
      redactTelemetryData({
        authorization: "Bearer launcher-secret",
        runtimeToken: "runtime-token",
        nested: {
          secretId: "secret-1",
          message: "failed with Bearer raw-secret and v1=abcdef1234567890abcdef1234567890",
        },
        values: [{ traceSignature: "v1=abcdef1234567890abcdef1234567890" }],
      }),
    ).toEqual({
      authorization: "[redacted]",
      runtimeToken: "[redacted]",
      nested: {
        secretId: "[redacted]",
        message: "failed with Bearer [redacted] and v1=[redacted]",
      },
      values: [{ traceSignature: "[redacted]" }],
    });
  });
});
