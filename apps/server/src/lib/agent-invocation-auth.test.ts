import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

import { prisma } from "./db.js";
import {
  authenticateAgentInvocationToken,
  createAgentInvocationToken,
  verifyAgentInvocationToken,
} from "./agent-invocation-auth.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;

describe("agent invocation auth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("round trips an audience-bound session capability set", () => {
    const token = createAgentInvocationToken({
      organizationId: "org-1",
      sessionId: "session-1",
      sessionGroupId: "group-1",
      invocationId: "invocation-1",
    });
    expect(verifyAgentInvocationToken(token)).toMatchObject({
      tokenType: "agent_invocation",
      organizationId: "org-1",
      sessionId: "session-1",
      sessionGroupId: "group-1",
      invocationId: "invocation-1",
      capabilities: expect.arrayContaining([
        "artifact:write",
        "resource:list",
        "session:list",
        "session:create",
        "session:read",
        "session:events",
        "session:send",
        "session:run",
        "session:stop",
        "session:archive",
      ]),
    });
  });

  it("rejects malformed credentials", () => {
    expect(verifyAgentInvocationToken("not-a-token")).toBeNull();
  });

  it("authenticates only while the bound invocation remains active and eligible", async () => {
    const token = createAgentInvocationToken({
      organizationId: "org-1",
      sessionId: "session-1",
      sessionGroupId: "group-1",
      invocationId: "invocation-1",
    });
    prismaMock.session.findFirst.mockResolvedValueOnce({ createdById: "owner-1" });

    await expect(authenticateAgentInvocationToken(token)).resolves.toMatchObject({
      kind: "agent",
      userId: "owner-1",
      sessionId: "session-1",
    });
    expect(prismaMock.session.findFirst).toHaveBeenCalledWith({
      where: {
        id: "session-1",
        organizationId: "org-1",
        sessionGroupId: "group-1",
        activeInvocationId: "invocation-1",
        agentStatus: { notIn: ["failed", "stopped"] },
      },
      select: { createdById: true },
    });

    prismaMock.session.findFirst.mockResolvedValueOnce(null);
    await expect(authenticateAgentInvocationToken(token)).resolves.toBeNull();
  });
});
