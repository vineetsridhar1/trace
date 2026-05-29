import { describe, expect, it } from "vitest";

import { formatSessionConnectionError } from "../src/session/connection-error.js";

describe("formatSessionConnectionError", () => {
  it("maps idle cleanup to a user-facing message", () => {
    expect(formatSessionConnectionError("idle_session_group_cleanup")).toBe(
      "This session's runtime was shut down after being idle. Retry to reconnect, or move it to another runtime.",
    );
  });

  it("keeps already user-facing messages", () => {
    expect(formatSessionConnectionError("Pi is not installed.")).toBe("Pi is not installed.");
  });

  it("hides unknown internal reason codes", () => {
    expect(formatSessionConnectionError("some_internal_reason")).toBe(
      "The runtime disconnected unexpectedly. Retry to reconnect, or move this session to another runtime.",
    );
  });

  it("returns null for empty messages", () => {
    expect(formatSessionConnectionError("   ")).toBeNull();
  });
});
