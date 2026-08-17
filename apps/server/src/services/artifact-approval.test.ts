import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/db.js", async () => {
  const { createPrismaMock } = await import("../../test/helpers.js");
  return { prisma: createPrismaMock() };
});

vi.mock("../lib/storage/index.js", () => ({
  storage: { putObject: vi.fn(), deleteObject: vi.fn(), getObject: vi.fn() },
}));

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
  approvalStatus: "PENDING",
  approvalAction: null,
  approvalPromptDigest: null,
  processingStartedAt: null,
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
      approvalStatus: "APPROVED",
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
        payload: expect.objectContaining({
          artifact: expect.objectContaining({ id: artifact.id, approvalStatus: "APPROVED" }),
          implementationSessionId: "session-1",
        }),
      }),
      prisma,
    );
    expect(result.implementationSession.id).toBe("session-1");
  });

  it("starts a new implementation session once without separately running the prompt", async () => {
    const started = { id: "session-2" };
    const start = vi.spyOn(sessionService, "start").mockResolvedValue(started as never);
    const run = vi.spyOn(sessionService, "run");
    const terminate = vi.spyOn(sessionService, "terminate").mockResolvedValue({} as never);

    await artifactService.approve({
      artifactId: artifact.id,
      organizationId: artifact.organizationId,
      actorId: "user-1",
      action: "NEW_SESSION",
      prompt: "Approved. Implement this plan.",
    });

    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Approved. Implement this plan.",
        clientMutationId: "artifact-approval:artifact-1:session",
        startEventId: "artifact-approval:artifact-1:session",
      }),
    );
    expect(run).not.toHaveBeenCalled();
    expect(terminate).toHaveBeenCalledWith("session-1", "user", "user-1");
  });

  it("keeps a failed side effect claimed for lease-based recovery", async () => {
    vi.spyOn(sessionService, "sendMessage").mockRejectedValue(new Error("runtime unavailable"));

    await expect(
      artifactService.approve({
        artifactId: artifact.id,
        organizationId: artifact.organizationId,
        actorId: "user-1",
        action: "KEEP_CONTEXT",
        prompt: "Approved.",
      }),
    ).rejects.toThrow("runtime unavailable");

    expect(prisma.artifact.updateMany).toHaveBeenCalledTimes(1);
    expect(asMock(prisma.artifact.updateMany).mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ approvalStatus: "PENDING" }),
        expect.objectContaining({ approvalStatus: "PROCESSING" }),
      ]),
    );
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
