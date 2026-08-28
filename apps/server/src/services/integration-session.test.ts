import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./session.js", () => ({
  sessionService: { start: vi.fn() },
}));

import { prisma } from "../lib/db.js";
import { sessionService } from "./session.js";
import { integrationSessionService } from "./integration-session.js";

const prismaMock = prisma as ReturnType<typeof import("../../test/helpers.js").createPrismaMock>;
const startMock = sessionService.start as ReturnType<typeof vi.fn>;
const credential = {
  id: "credential-1",
  organizationId: "org-1",
  createdById: "user-1",
  scopes: ["sessions_create", "sessions_read"],
  allowedChannelIds: ["channel-1"],
};
const session = {
  id: "session-1",
  name: "Fix checkout",
  agentStatus: "not_started",
  sessionStatus: "in_progress",
  sessionGroupId: "group-1",
  channelId: "channel-1",
  prUrl: null,
  connection: {},
  createdAt: new Date("2026-08-25T12:00:00Z"),
  updatedAt: new Date("2026-08-25T12:00:00Z"),
  sessionGroup: { setupError: null },
};

describe("IntegrationSessionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TRACE_WEB_URL", "https://trace.example");
  });

  it("starts an attributed cloud session with credential-scoped idempotency", async () => {
    startMock.mockResolvedValue(session);

    const result = await integrationSessionService.create(credential, {
      prompt: "Fix checkout",
      channelId: "channel-1",
      idempotencyKey: "incident-42",
    });

    expect(startMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "coding",
        hosting: "cloud",
        actorType: "agent",
        clientSource: "integration",
        integrationCredentialId: "credential-1",
        clientMutationId: "integration:credential-1:incident-42",
      }),
    );
    expect(result.url).toBe("https://trace.example/c/channel-1/g/group-1/s/session-1");
  });

  it("rejects channels outside the credential allowlist", async () => {
    await expect(
      integrationSessionService.create(credential, {
        prompt: "Fix checkout",
        channelId: "channel-2",
        idempotencyKey: "incident-42",
      }),
    ).rejects.toThrow("Channel is not allowed");
    expect(startMock).not.toHaveBeenCalled();
  });

  it("loads status only through the credential ownership predicate", async () => {
    prismaMock.session.findFirst.mockResolvedValue(session);

    await expect(integrationSessionService.get(credential, "session-1")).resolves.toEqual(
      expect.objectContaining({ id: "session-1", sessionStatus: "in_progress" }),
    );
    expect(prismaMock.session.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "session-1",
          organizationId: "org-1",
          integrationCredentialId: "credential-1",
        },
      }),
    );
  });
});
