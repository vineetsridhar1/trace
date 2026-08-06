import { describe, expect, it } from "vitest";
import { createAgentInvocationToken, verifyAgentInvocationToken } from "./agent-invocation-auth.js";

describe("agent invocation auth", () => {
  it("round trips a session-scoped artifact capability", () => {
    const token = createAgentInvocationToken({
      organizationId: "org-1",
      sessionId: "session-1",
      invocationId: "invocation-1",
    });
    expect(verifyAgentInvocationToken(token)).toMatchObject({
      tokenType: "agent_invocation",
      organizationId: "org-1",
      sessionId: "session-1",
      invocationId: "invocation-1",
      scope: "artifact:write",
      scopes: ["artifact:write", "design:read"],
    });
  });

  it("rejects malformed credentials", () => {
    expect(verifyAgentInvocationToken("not-a-token")).toBeNull();
  });
});
