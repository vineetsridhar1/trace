import { describe, expect, it } from "vitest";
import { createAgentRunToken, verifyAgentRunToken } from "./agent-run-auth.js";

describe("agent run authentication", () => {
  it("mints a run-scoped visual-plan credential", () => {
    const token = createAgentRunToken({
      organizationId: "org-1",
      runId: "run-1",
      sessionId: "session-1",
    });

    expect(verifyAgentRunToken(token)).toMatchObject({
      tokenType: "agent_run",
      organizationId: "org-1",
      runId: "run-1",
      sessionId: "session-1",
      scopes: ["visual-plan:write"],
    });
    expect(verifyAgentRunToken(`${token}tampered`)).toBeNull();
  });
});
