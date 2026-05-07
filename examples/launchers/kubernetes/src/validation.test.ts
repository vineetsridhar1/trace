import { describe, expect, it } from "vitest";
import { startSessionRequestFixture } from "./test-fixtures.js";
import {
  validateSessionStatusRequest,
  validateStartSessionRequest,
  validateStopSessionRequest,
} from "./validation.js";

describe("request validation", () => {
  it("validates start requests", () => {
    expect(validateStartSessionRequest(startSessionRequestFixture)).toMatchObject({
      sessionId: "sess-123",
      runtimeInstanceId: "runtime-abc123",
      tool: "codex",
    });
  });

  it("rejects invalid start requests", () => {
    expect(() =>
      validateStartSessionRequest({ ...startSessionRequestFixture, runtimeToken: "" }),
    ).toThrow("runtimeToken must be a non-empty string");
  });

  it("validates stop and status requests", () => {
    expect(
      validateStopSessionRequest({
        sessionId: "sess-123",
        runtimeId: "trace-runtime-runtimeabc123",
        reason: "session_stopped",
      }),
    ).toMatchObject({ runtimeId: "trace-runtime-runtimeabc123" });
    expect(validateSessionStatusRequest({ runtimeId: "trace-runtime-runtimeabc123" })).toEqual({
      runtimeId: "trace-runtime-runtimeabc123",
    });
  });
});
