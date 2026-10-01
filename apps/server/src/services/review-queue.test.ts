import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, type Event as PrismaEvent } from "@prisma/client";

vi.mock("../lib/db.js", () => ({ prisma: createReviewPrismaMock() }));
vi.mock("../lib/storage/index.js", () => ({ storage: { putObject: vi.fn(), getObject: vi.fn() } }));
vi.mock("./access.js", () => ({ assertSessionAccess: vi.fn() }));
vi.mock("./api-token.js", () => ({
  apiTokenService: { getDecryptedTokens: vi.fn().mockResolvedValue({ github: "token" }) },
}));
vi.mock("./event.js", () => ({ eventService: { create: vi.fn() } }));
vi.mock("./session.js", () => ({
  sessionService: { sendMessage: vi.fn().mockResolvedValue({ id: "event-out" }) },
}));

function table(...methods: string[]) {
  return Object.fromEntries(methods.map((name) => [name, vi.fn()]));
}

function createReviewPrismaMock() {
  return {
    $transaction: vi.fn(),
    review: table("findUnique", "findFirst", "update"),
    reviewInquiry: table(
      "findFirst",
      "findMany",
      "findUniqueOrThrow",
      "update",
      "updateMany",
      "groupBy",
    ),
    reviewGuide: table("findFirst", "create", "updateMany"),
    session: table("findUnique"),
    reviewDelivery: table("findUnique", "findUniqueOrThrow", "create", "update", "updateMany"),
    sessionMessage: table("findMany", "findUnique"),
  };
}

import { prisma } from "../lib/db.js";
import { eventService } from "./event.js";
import { sessionService } from "./session.js";
import { ReviewService, reviewService } from "./review.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = prisma as any;
const events = eventService as any;
const sessions = sessionService as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const STARTED_AT = new Date("2026-10-01T12:00:00.000Z");

function outputEvent(payload: Record<string, unknown>): PrismaEvent {
  return {
    id: "event-1",
    organizationId: "org-1",
    scopeType: "session",
    scopeId: "session-1",
    eventType: "session_output",
    payload,
    actorType: "system",
    actorId: "system",
  } as unknown as PrismaEvent;
}

function message(id: string, text: string, minutesAfterStart: number) {
  return {
    id,
    text,
    role: "assistant",
    createdAt: new Date(STARTED_AT.getTime() + minutesAfterStart * 60_000),
  };
}

function runningInquiry(overrides: Record<string, unknown> = {}) {
  return {
    id: "inquiry-1",
    reviewId: "review-1",
    snapshotId: "snapshot-1",
    sessionId: "session-1",
    sourceKind: "diff_anchor",
    state: "running",
    startedAt: STARTED_AT,
    position: 1,
    ...overrides,
  };
}

function eventTypes(): string[] {
  return events.create.mock.calls.map((call: [{ eventType: string }]) => call[0].eventType);
}

beforeEach(() => {
  vi.clearAllMocks();
  db.reviewInquiry.updateMany.mockResolvedValue({ count: 1 });
  db.reviewInquiry.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(runningInquiry(data)),
  );
  db.reviewInquiry.findUniqueOrThrow.mockResolvedValue(runningInquiry({ state: "failed" }));
  db.reviewInquiry.findMany.mockResolvedValue([]);
  db.reviewInquiry.groupBy.mockResolvedValue([]);
  db.review.findUnique.mockResolvedValue({ attachedSessionId: "session-1" });
  db.session.findUnique.mockResolvedValue({ agentStatus: "done", sessionStatus: "in_progress" });
  db.sessionMessage.findMany.mockResolvedValue([]);
  db.sessionMessage.findUnique.mockResolvedValue(null);
});

describe("turn correlation", () => {
  it("ignores assistant output, which fires many times inside one turn", async () => {
    db.reviewInquiry.findFirst.mockResolvedValue(runningInquiry());

    await reviewService.handleSessionOutputEvent(
      outputEvent({
        type: "assistant",
        message: { content: [{ type: "text", text: "I'll look" }] },
      }),
    );

    expect(db.reviewInquiry.findFirst).not.toHaveBeenCalled();
    expect(db.reviewInquiry.updateMany).not.toHaveBeenCalled();
  });

  it("will not complete the same turn twice if `result` arrives again", async () => {
    db.reviewInquiry.findFirst.mockResolvedValueOnce(runningInquiry()).mockResolvedValue(null);
    db.sessionMessage.findMany.mockResolvedValue([message("message-1", "Answer.", 1)]);
    db.reviewInquiry.updateMany.mockResolvedValue({ count: 0 });

    await reviewService.handleSessionOutputEvent(
      outputEvent({ type: "result", subtype: "success" }),
    );

    expect(events.create).not.toHaveBeenCalled();
  });

  it("answers with the last assistant message of the completed turn", async () => {
    db.reviewInquiry.findFirst.mockResolvedValueOnce(runningInquiry()).mockResolvedValue(null);
    db.sessionMessage.findMany.mockResolvedValue([
      message("message-1", "Let me read the diff.", 1),
      message("message-2", "The retry loop never resets its backoff.", 2),
    ]);

    await reviewService.handleSessionOutputEvent(
      outputEvent({ type: "result", subtype: "success" }),
    );

    expect(db.reviewInquiry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "inquiry-1", state: "running" }),
        data: expect.objectContaining({ state: "completed", responseMessageId: "message-2" }),
      }),
    );
    expect(eventTypes()).toContain("review_inquiry_completed");
  });

  it("only considers messages from this inquiry's own turn", async () => {
    db.reviewInquiry.findFirst.mockResolvedValueOnce(runningInquiry()).mockResolvedValue(null);
    db.sessionMessage.findMany.mockResolvedValue([message("message-1", "Answer.", 1)]);

    await reviewService.handleSessionOutputEvent(
      outputEvent({ type: "result", subtype: "success" }),
    );

    expect(db.sessionMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sessionId: "session-1",
          role: "assistant",
          createdAt: { gte: STARTED_AT },
        }),
      }),
    );
  });

  it("still completes when a human message arrived mid-turn", async () => {
    db.reviewInquiry.findFirst.mockResolvedValueOnce(runningInquiry()).mockResolvedValue(null);
    db.sessionMessage.findMany.mockResolvedValue([message("message-1", "The answer.", 1)]);

    await reviewService.handleSessionOutputEvent(
      outputEvent({ type: "result", subtype: "success" }),
    );

    // That message is queued behind this turn, so this `result` is still the inquiry's own answer.
    expect(db.reviewInquiry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: "completed", responseMessageId: "message-1" }),
      }),
    );
  });

  it("bounds the turn by the inquiry's own outgoing prompt", async () => {
    const promptAt = new Date(STARTED_AT.getTime() + 30_000);
    db.reviewInquiry.findFirst
      .mockResolvedValueOnce(runningInquiry({ sessionMessageId: "prompt-1" }))
      .mockResolvedValue(null);
    db.sessionMessage.findUnique.mockResolvedValue({ id: "prompt-1", createdAt: promptAt });
    db.sessionMessage.findMany.mockResolvedValue([message("message-1", "Answer.", 1)]);

    await reviewService.handleSessionOutputEvent(
      outputEvent({ type: "result", subtype: "success" }),
    );

    expect(db.sessionMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { gte: promptAt } }),
      }),
    );
  });

  it("fails the inquiry when the turn ends in an error", async () => {
    db.reviewInquiry.findFirst.mockResolvedValueOnce(runningInquiry()).mockResolvedValue(null);

    await reviewService.handleSessionOutputEvent(outputEvent({ type: "result", subtype: "error" }));

    expect(db.reviewInquiry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: "failed" }),
      }),
    );
    expect(eventTypes()).toContain("review_inquiry_failed");
  });

  it("fails the inquiry when the turn produced no answer at all", async () => {
    db.reviewInquiry.findFirst.mockResolvedValueOnce(runningInquiry()).mockResolvedValue(null);
    db.sessionMessage.findMany.mockResolvedValue([]);

    await reviewService.handleSessionOutputEvent(
      outputEvent({ type: "result", subtype: "success" }),
    );

    expect(db.reviewInquiry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ state: "failed" }) }),
    );
  });

  it("picks the Guide JSON even when the agent signs off after it", async () => {
    const guide = {
      title: "Adds review",
      intent: "Explains the change.",
      chapters: [
        {
          id: "core",
          title: "Core",
          explanation: "The service owns it.",
          implications: [],
          files: ["src/a.ts"],
        },
      ],
      everythingElse: [],
    };
    db.reviewInquiry.findFirst
      .mockResolvedValueOnce(runningInquiry({ sourceKind: "guide_generation" }))
      .mockResolvedValueOnce({
        id: "inquiry-1",
        reviewId: "review-1",
        snapshotId: "snapshot-1",
        sourceKind: "guide_generation",
        snapshot: { files: [{ path: "src/a.ts" }] },
      })
      .mockResolvedValue(null);
    db.sessionMessage.findMany.mockResolvedValue([
      message("message-1", "Reading the diff now.", 1),
      message("message-2", JSON.stringify(guide), 2),
      message("message-3", "Let me know if you want more detail.", 3),
    ]);
    db.$transaction.mockImplementation((run: (tx: unknown) => unknown) => Promise.resolve(run(db)));
    db.reviewGuide.findFirst.mockResolvedValue(null);
    db.reviewGuide.create.mockResolvedValue({ id: "guide-1", reviewId: "review-1" });

    await reviewService.handleSessionOutputEvent(
      outputEvent({ type: "result", subtype: "success" }),
    );

    expect(db.reviewInquiry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: "completed", responseMessageId: "message-2" }),
      }),
    );
    expect(eventTypes()).toContain("review_guide_saved");
  });
});

describe("FIFO dispatch", () => {
  it("does not send a prompt while the session is still on another turn", async () => {
    db.reviewInquiry.findFirst.mockResolvedValue(
      runningInquiry({ review: { organizationId: "org-1" } }),
    );

    await reviewService.recoverStuckInquiries();
    db.reviewInquiry.groupBy.mockResolvedValue([{ sessionId: "session-1" }]);
    await reviewService.recoverStuckInquiries();

    expect(sessions.sendMessage).not.toHaveBeenCalled();
  });

  it("dispatches the next queued question into an idle session", async () => {
    db.reviewInquiry.groupBy.mockResolvedValue([{ sessionId: "session-1" }]);
    db.reviewInquiry.findFirst.mockResolvedValueOnce(null).mockResolvedValue(
      runningInquiry({
        state: "queued",
        review: { organizationId: "org-1", createdById: "user-1" },
        snapshot: { baseSha: "base", headSha: "head", files: [] },
      }),
    );
    db.sessionMessage.findUnique.mockResolvedValue({ id: "prompt-1" });

    await reviewService.recoverStuckInquiries();

    expect(sessions.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "session-1", interactionMode: "ask" }),
    );
    expect(eventTypes()).toContain("review_inquiry_started");
  });

  it("does not dispatch into a session the agent is still working in", async () => {
    db.reviewInquiry.findFirst.mockResolvedValue(null);
    db.reviewInquiry.groupBy.mockResolvedValue([{ sessionId: "session-1" }]);
    db.session.findUnique.mockResolvedValue({
      agentStatus: "active",
      sessionStatus: "in_progress",
    });
    db.reviewInquiry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue(runningInquiry({ state: "queued", review: { organizationId: "org-1" } }));

    await reviewService.recoverStuckInquiries();

    // Prompting a busy agent queues behind its turn, whose `result` would then be misread as this
    // inquiry's answer.
    expect(sessions.sendMessage).not.toHaveBeenCalled();
    expect(db.reviewInquiry.updateMany).not.toHaveBeenCalled();
  });

  it("expires a turn that never finished so the queue can move on", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(STARTED_AT.getTime() + 31 * 60_000));
    db.reviewInquiry.findMany.mockResolvedValue([
      { id: "inquiry-1", sessionId: "session-1", review: { organizationId: "org-1" } },
    ]);

    await reviewService.recoverStuckInquiries();

    expect(db.reviewInquiry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "inquiry-1" }),
        data: expect.objectContaining({ state: "failed" }),
      }),
    );
    vi.useRealTimers();
  });

  it("only looks for stale turns past the timeout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(STARTED_AT.getTime() + 31 * 60_000));

    await reviewService.recoverStuckInquiries();

    expect(db.reviewInquiry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          state: "running",
          startedAt: { lt: new Date(STARTED_AT.getTime() + 60_000) },
        }),
      }),
    );
    vi.useRealTimers();
  });
});

describe("GitHub delivery", () => {
  // A stub provider so a lost claim can be proven to never reach GitHub.
  const provider = {
    readFileAtCommit: vi.fn(),
    resolvePullRequest: vi.fn(),
    submitReview: vi.fn(),
  };
  const service = new ReviewService(provider);

  const review = {
    id: "review-1",
    organizationId: "org-1",
    attachedSessionId: "session-1",
    currentSnapshotId: "snapshot-1",
    currentSnapshot: { id: "snapshot-1", headSha: "head-sha" },
    pullRequestUrl: "https://github.com/acme/widgets/pull/42",
    threads: [
      {
        id: "thread-1",
        scope: "line",
        deliveryStatus: "selected",
        providerReviewId: null,
        providerCommentId: null,
        anchor: { snapshotId: "snapshot-1", status: "current", filePath: "src/a.ts" },
        comments: [{ body: "Needs a guard.", deletedAt: null, providerCommentId: null }],
      },
    ],
  };

  const submission = {
    organizationId: "org-1",
    actorId: "user-1",
    actorType: "user" as const,
    reviewId: "review-1",
    snapshotId: "snapshot-1",
    threadIds: ["thread-1"],
    disposition: "comment" as const,
    idempotencyKey: "key-1",
  };

  it("claims a retry with one conditional write, so a race cannot double-post", async () => {
    db.review.findFirst.mockResolvedValue(review);
    db.reviewDelivery.findUnique.mockResolvedValue({
      id: "delivery-1",
      reviewId: "review-1",
      actorId: "user-1",
      snapshotId: "snapshot-1",
      disposition: "comment",
      threadIds: ["thread-1"],
      status: "failed",
      startedAt: new Date(0),
      createdAt: new Date(0),
    });
    // The losing side of the race: another caller already flipped the row to submitting.
    db.reviewDelivery.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.submit(submission)).rejects.toThrow(
      "This review is already being sent to GitHub",
    );
    expect(db.reviewDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "delivery-1",
          OR: [
            { status: { notIn: ["submitting", "succeeded"] } },
            expect.objectContaining({ status: "submitting" }),
          ],
        }),
      }),
    );
    expect(provider.submitReview).not.toHaveBeenCalled();
  });

  it("treats a lost create race on the same key as already in flight", async () => {
    db.review.findFirst.mockResolvedValue(review);
    db.reviewDelivery.findUnique.mockResolvedValue(null);
    db.reviewDelivery.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate key", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    await expect(service.submit(submission)).rejects.toThrow(
      "This review is already being sent to GitHub",
    );
    expect(provider.submitReview).not.toHaveBeenCalled();
  });

  it("returns the original result for a key that already succeeded", async () => {
    db.review.findFirst.mockResolvedValue(review);
    const succeeded = {
      id: "delivery-1",
      reviewId: "review-1",
      actorId: "user-1",
      status: "succeeded",
      providerReviewId: "github-review-1",
    };
    db.reviewDelivery.findUnique.mockResolvedValue(succeeded);

    await expect(service.submit(submission)).resolves.toBe(succeeded);
    expect(db.reviewDelivery.create).not.toHaveBeenCalled();
  });

  it("rejects reusing a key for a different set of threads", async () => {
    db.review.findFirst.mockResolvedValue(review);
    db.reviewDelivery.updateMany.mockResolvedValue({ count: 1 });
    db.reviewDelivery.findUnique.mockResolvedValue({
      id: "delivery-1",
      reviewId: "review-1",
      actorId: "user-1",
      snapshotId: "snapshot-1",
      disposition: "comment",
      threadIds: ["thread-9"],
      status: "failed",
      startedAt: new Date(0),
      createdAt: new Date(0),
    });

    await expect(service.submit(submission)).rejects.toThrow(
      "Idempotency key was already used for a different submission",
    );
  });
});
