import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("./event.js", () => ({
  eventService: {
    create: vi.fn().mockResolvedValue({ id: "event-1" }),
    publishCreated: vi.fn(),
  },
}));

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { asMock } from "../../test/helpers.js";
import { artifactService } from "./artifact.js";
import { sessionService } from "./session.js";

const artifact = {
  id: "artifact-1",
  organizationId: "org-1",
  sessionId: "session-1",
  type: "trace.visual-plan.v1",
  key: "primary",
  bundleDigest: "sha256:plan",
  approvalStatus: "pending",
  implementationSessionId: null,
  session: {
    id: "session-1",
    tool: "claude_code",
    model: "sonnet",
    reasoningEffort: null,
    channelId: "channel-1",
    repoId: "repo-1",
    branch: "main",
    sessionGroupId: "group-1",
    sessionGroup: { visibility: "public", ownerUserId: "user-1", kind: "coding" },
  },
};

describe("ArtifactService.approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(prisma.artifact.findFirstOrThrow).mockResolvedValue(artifact as never);
    asMock(prisma.artifact.findFirst).mockResolvedValue({ id: artifact.id } as never);
    asMock(prisma.artifact.updateMany).mockResolvedValue({ count: 1 } as never);
    asMock(prisma.artifact.update).mockResolvedValue({
      ...artifact,
      approvalStatus: "approved",
    } as never);
    asMock(prisma.session.findUniqueOrThrow).mockResolvedValue({ id: "session-1" } as never);
  });

  it("sends keep-context approval and records one approval event", async () => {
    const sendMessage = vi.spyOn(sessionService, "sendMessage").mockResolvedValue({} as never);

    const result = await artifactService.approve({
      artifactId: artifact.id,
      organizationId: artifact.organizationId,
      actorId: "user-1",
      action: "KEEP_CONTEXT",
      prompt: "Approved. Implement this plan.",
    });

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        text: "Approved. Implement this plan.",
        clientMutationId: "artifact-approval:artifact-1",
      }),
    );
    expect(eventService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "artifact_approved",
        payload: expect.objectContaining({ action: "KEEP_CONTEXT" }),
      }),
      prisma,
    );
    expect(result.implementationSession.id).toBe("session-1");
  });

  it("rejects a competing approval before starting implementation work", async () => {
    asMock(prisma.artifact.updateMany).mockResolvedValueOnce({ count: 0 } as never);
    const sendMessage = vi.spyOn(sessionService, "sendMessage");

    await expect(
      artifactService.approve({
        artifactId: artifact.id,
        organizationId: artifact.organizationId,
        actorId: "user-1",
        action: "KEEP_CONTEXT",
        prompt: "Approved.",
      }),
    ).rejects.toThrow("already being processed");

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
