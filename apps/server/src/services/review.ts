import { createHash, randomUUID } from "node:crypto";
import {
  Prisma,
  type ActorType,
  type Event as PrismaEvent,
  type ReviewInquiryState,
} from "@prisma/client";
import { prisma } from "../lib/db.js";
import { storage } from "../lib/storage/index.js";
import { AuthorizationError, NotFoundError, ValidationError } from "../lib/errors.js";
import { assertSessionAccess } from "./access.js";
import { apiTokenService } from "./api-token.js";
import { eventService } from "./event.js";
import { parseGitHubRepo } from "./github-repo.js";
import {
  githubReviewProvider,
  parseGitHubPullRequestUrl,
  type ResolvedPullRequest,
  type ReviewProviderAdapter,
} from "./review-provider.js";
import { sessionService } from "./session.js";
import {
  guideGenerationInstruction,
  parseGuideResponse,
  REVIEW_GUIDE_SKILL_INSTRUCTION,
  validateReviewGuide,
} from "./review-guide.js";

const REVIEW_INCLUDE = {
  repository: true,
  channel: true,
  sourceSessionGroup: true,
  attachedSession: true,
  currentSnapshot: true,
  snapshots: { orderBy: { createdAt: "desc" as const } },
  threads: {
    include: {
      author: true,
      comments: { include: { author: true }, orderBy: { createdAt: "asc" as const } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  inquiries: { orderBy: { position: "asc" as const } },
  guides: { orderBy: [{ snapshotId: "asc" as const }, { version: "desc" as const }] },
} satisfies Prisma.ReviewInclude;

type ReviewWithInclude = Prisma.ReviewGetPayload<{ include: typeof REVIEW_INCLUDE }>;

type ActorInput = { organizationId: string; actorId: string; actorType: ActorType };

interface StoredReviewPatch {
  version: 1;
  baseSha: string;
  headSha: string;
  files: ResolvedPullRequest["files"];
}

export function reviewJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, nested) => (typeof nested === "bigint" ? Number(nested) : nested)),
  ) as Prisma.InputJsonValue;
}

function checksum(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

function cleanBody(value: string, label = "Comment"): string {
  const body = value.trim();
  if (!body) throw new ValidationError(`${label} cannot be empty`);
  if (body.length > 65_000) throw new ValidationError(`${label} is too long`);
  return body;
}

export function hasProviderDelivery(thread: {
  deliveryStatus: string;
  providerReviewId?: string | null;
  providerCommentId?: string | null;
  comments: Array<{ providerCommentId?: string | null }>;
}): boolean {
  return (
    thread.deliveryStatus === "delivered" ||
    !!thread.providerReviewId ||
    !!thread.providerCommentId ||
    thread.comments.some((comment) => !!comment.providerCommentId)
  );
}

export function isFinishedInquiryState(state: ReviewInquiryState): boolean {
  return state !== "queued" && state !== "running";
}

function patchKey(reviewId: string, snapshotId: string): string {
  return `reviews/${reviewId}/snapshots/${snapshotId}/diff-v1.json`;
}

function fileSummaries(pull: ResolvedPullRequest): Prisma.InputJsonValue {
  return reviewJson(
    pull.files.map((file) => ({
      path: file.path,
      previousPath: file.previousPath,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patchAvailable: file.patch.length > 0,
      viewed: false,
      commentCount: 0,
    })),
  );
}

function reviewPayload(review: ReviewWithInclude): Prisma.InputJsonValue {
  return reviewJson({ review });
}

function anchorRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validateAnchor(
  anchor: Record<string, unknown>,
  snapshotId: string,
  paths: Set<string>,
): Prisma.InputJsonValue {
  if (anchor.snapshotId !== snapshotId) throw new ValidationError("Anchor snapshot does not match");
  if (typeof anchor.filePath !== "string" || !paths.has(anchor.filePath)) {
    throw new ValidationError("Anchor file is not part of this snapshot");
  }
  if (anchor.side !== "base" && anchor.side !== "head")
    throw new ValidationError("Invalid diff side");
  if (
    !Number.isInteger(anchor.startLine) ||
    !Number.isInteger(anchor.endLine) ||
    Number(anchor.startLine) < 1 ||
    Number(anchor.endLine) < Number(anchor.startLine)
  ) {
    throw new ValidationError("Invalid anchor line range");
  }
  return reviewJson({ ...anchor, status: "current" });
}

export class ReviewService {
  constructor(private readonly provider: ReviewProviderAdapter = githubReviewProvider) {}

  async get(input: ActorInput & { id: string }): Promise<ReviewWithInclude> {
    const review = await prisma.review.findFirst({
      where: { id: input.id, organizationId: input.organizationId },
      include: REVIEW_INCLUDE,
    });
    if (!review) throw new NotFoundError("Review", input.id);
    await assertSessionAccess(review.attachedSessionId, input.actorId, input.organizationId);
    return review;
  }

  async getForSessionGroup(input: ActorInput & { sessionGroupId: string }) {
    const review = await prisma.review.findFirst({
      where: {
        sourceSessionGroupId: input.sessionGroupId,
        organizationId: input.organizationId,
        status: "open",
      },
      include: REVIEW_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });
    if (!review) return null;
    await assertSessionAccess(review.attachedSessionId, input.actorId, input.organizationId);
    return review;
  }

  async open(input: ActorInput & { sessionId: string; pullRequestUrl: string }) {
    await assertSessionAccess(input.sessionId, input.actorId, input.organizationId);
    const session = await prisma.session.findFirst({
      where: { id: input.sessionId, organizationId: input.organizationId },
      include: { repo: true, sessionGroup: { include: { repo: true } } },
    });
    if (!session) throw new NotFoundError("Session", input.sessionId);
    const repo = session.repo ?? session.sessionGroup?.repo;
    if (!repo || repo.provider !== "github" || !repo.remoteUrl) {
      throw new ValidationError("The coding session must be linked to a GitHub repository");
    }
    const urlTarget = parseGitHubPullRequestUrl(input.pullRequestUrl);
    const linkedRepo = parseGitHubRepo(repo.remoteUrl);
    if (
      !urlTarget ||
      !linkedRepo ||
      urlTarget.repo.owner.toLowerCase() !== linkedRepo.owner.toLowerCase() ||
      urlTarget.repo.repo.toLowerCase() !== linkedRepo.repo.toLowerCase()
    ) {
      throw new ValidationError("Pull request repository does not match the session repository");
    }
    const token = await this.githubToken(input.actorId);
    const pull = await this.provider.resolvePullRequest(input.pullRequestUrl, token);
    let review = await prisma.review.findFirst({
      where: {
        organizationId: input.organizationId,
        provider: "github",
        remotePullRequestId: pull.remoteId,
        sourceSessionGroupId: session.sessionGroupId,
      },
      include: REVIEW_INCLUDE,
    });
    if (!review) {
      review = await prisma.review.create({
        data: {
          organizationId: input.organizationId,
          repositoryId: repo.id,
          channelId: session.channelId,
          sourceSessionGroupId: session.sessionGroupId,
          attachedSessionId: session.id,
          provider: "github",
          remotePullRequestId: pull.remoteId,
          pullRequestNumber: pull.number,
          pullRequestUrl: pull.url,
          title: pull.title,
          description: pull.description,
          createdById: input.actorId,
        },
        include: REVIEW_INCLUDE,
      });
      await eventService.create({
        organizationId: input.organizationId,
        scopeType: "review",
        scopeId: review.id,
        eventType: "review_opened",
        payload: reviewPayload(review),
        actorType: input.actorType,
        actorId: input.actorId,
      });
    } else if (review.attachedSessionId !== session.id || review.status !== "open") {
      review = await prisma.review.update({
        where: { id: review.id },
        data: { attachedSessionId: session.id, status: "open" },
        include: REVIEW_INCLUDE,
      });
      await this.emit(review.id, input, "review_updated", { review });
    }
    return this.captureSnapshot(review, pull, input);
  }

  async refresh(input: ActorInput & { reviewId: string }) {
    const review = await this.get({ ...input, id: input.reviewId });
    const token = await this.githubToken(input.actorId);
    const pull = await this.provider.resolvePullRequest(review.pullRequestUrl, token);
    return this.captureSnapshot(review, pull, input);
  }

  async diffFile(input: ActorInput & { snapshotId: string; filePath: string }) {
    const snapshot = await prisma.reviewSnapshot.findFirst({
      where: { id: input.snapshotId, review: { organizationId: input.organizationId } },
      include: { review: true },
    });
    if (!snapshot) throw new NotFoundError("Review snapshot", input.snapshotId);
    await assertSessionAccess(
      snapshot.review.attachedSessionId,
      input.actorId,
      input.organizationId,
    );
    const stored = JSON.parse(
      (await storage.getObject(snapshot.patchStorageKey)).toString("utf8"),
    ) as StoredReviewPatch;
    const file = stored.files.find((candidate) => candidate.path === input.filePath);
    if (!file) throw new NotFoundError("Review file", input.filePath);
    return {
      snapshotId: snapshot.id,
      ...file,
      originalContent: null,
      modifiedContent: null,
      truncated: !file.patch,
    };
  }

  async createThread(
    input: ActorInput & {
      reviewId: string;
      snapshotId: string;
      scope: "line" | "file" | "general" | "guide_explanation";
      body: string;
      anchor?: Record<string, unknown> | null;
      guideChapterId?: string | null;
    },
  ) {
    const review = await this.get({ ...input, id: input.reviewId });
    const snapshot = review.snapshots.find((candidate) => candidate.id === input.snapshotId);
    if (!snapshot) throw new ValidationError("Snapshot does not belong to this review");
    const files = new Set(
      (snapshot.files as Array<{ path?: unknown }>).flatMap((file) =>
        typeof file.path === "string" ? [file.path] : [],
      ),
    );
    const anchor = input.anchor ? validateAnchor(input.anchor, snapshot.id, files) : undefined;
    if ((input.scope === "line" || input.scope === "file") && !anchor) {
      throw new ValidationError("Code-scoped threads require an anchor");
    }
    const thread = await prisma.reviewThread.create({
      data: {
        reviewId: review.id,
        originSnapshotId: snapshot.id,
        authorId: input.actorId,
        scope: input.scope,
        anchor,
        guideChapterId: input.guideChapterId,
        comments: { create: { authorId: input.actorId, body: cleanBody(input.body) } },
      },
      include: { author: true, comments: { include: { author: true } } },
    });
    await this.emit(review.id, input, "review_thread_created", { thread });
    return thread;
  }

  async reply(input: ActorInput & { threadId: string; body: string }) {
    const thread = await this.thread(input.threadId, input);
    const comment = await prisma.reviewComment.create({
      data: { threadId: thread.id, authorId: input.actorId, body: cleanBody(input.body, "Reply") },
      include: { author: true },
    });
    const updatedThread = await prisma.reviewThread.findUniqueOrThrow({
      where: { id: thread.id },
      include: {
        author: true,
        comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      },
    });
    await this.emit(thread.reviewId, input, "review_comment_created", {
      comment,
      thread: updatedThread,
    });
    return comment;
  }

  async editComment(input: ActorInput & { commentId: string; body: string }) {
    const existing = await prisma.reviewComment.findFirst({
      where: { id: input.commentId, thread: { review: { organizationId: input.organizationId } } },
      include: { thread: true },
    });
    if (!existing) throw new NotFoundError("Review comment", input.commentId);
    if (existing.authorId !== input.actorId)
      throw new AuthorizationError("Only the author can edit this comment");
    const comment = await prisma.reviewComment.update({
      where: { id: existing.id },
      data: { body: cleanBody(input.body), editedAt: new Date() },
      include: { author: true },
    });
    const updatedThread = await prisma.reviewThread.findUniqueOrThrow({
      where: { id: existing.threadId },
      include: {
        author: true,
        comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
      },
    });
    await this.emit(existing.thread.reviewId, input, "review_thread_updated", {
      comment,
      thread: updatedThread,
    });
    return comment;
  }

  async resolveThread(input: ActorInput & { threadId: string; resolved: boolean }) {
    const existing = await this.thread(input.threadId, input);
    const thread = await prisma.reviewThread.update({
      where: { id: existing.id },
      data: input.resolved
        ? { resolvedAt: new Date(), resolvedById: input.actorId }
        : { resolvedAt: null, resolvedById: null },
      include: { author: true, comments: { include: { author: true } } },
    });
    await this.emit(existing.reviewId, input, "review_thread_resolved", { thread });
    return thread;
  }

  async selectThread(input: ActorInput & { threadId: string; selected: boolean }) {
    const existing = await this.thread(input.threadId, input);
    if (existing.deliveryStatus === "delivered")
      throw new ValidationError("Delivered threads cannot be reselected");
    const thread = await prisma.reviewThread.update({
      where: { id: existing.id },
      data: { deliveryStatus: input.selected ? "selected" : "trace_only", deliveryError: null },
      include: { author: true, comments: { include: { author: true } } },
    });
    await this.emit(existing.reviewId, input, "review_thread_updated", { thread });
    return thread;
  }

  async reanchor(input: ActorInput & { threadId: string; anchor: Record<string, unknown> }) {
    const existing = await this.thread(input.threadId, input);
    const snapshotId = String(input.anchor.snapshotId ?? "");
    const snapshot = await prisma.reviewSnapshot.findFirst({
      where: { id: snapshotId, reviewId: existing.reviewId },
    });
    if (!snapshot) throw new ValidationError("Snapshot does not belong to this review");
    const paths = new Set(
      (snapshot.files as Array<{ path?: unknown }>).flatMap((file) =>
        typeof file.path === "string" ? [file.path] : [],
      ),
    );
    const thread = await prisma.reviewThread.update({
      where: { id: existing.id },
      data: {
        anchor: validateAnchor(input.anchor, snapshot.id, paths),
        deliveryStatus: "trace_only",
      },
      include: { author: true, comments: { include: { author: true } } },
    });
    await this.emit(existing.reviewId, input, "review_thread_reanchored", { thread });
    return thread;
  }

  async enqueueInquiry(
    input: ActorInput & {
      reviewId: string;
      snapshotId: string;
      sourceKind: "guide_generation" | "diff_anchor" | "guide_anchor" | "thread";
      question: string;
      anchor?: unknown;
      context?: unknown;
    },
  ) {
    const review = await this.get({ ...input, id: input.reviewId });
    const snapshot = review.snapshots.find((candidate) => candidate.id === input.snapshotId);
    if (!snapshot) throw new ValidationError("Snapshot does not belong to this review");
    const inquiry = await prisma.$transaction(async (tx) => {
      const latest = await tx.reviewInquiry.findFirst({
        where: { reviewId: review.id },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      return tx.reviewInquiry.create({
        data: {
          reviewId: review.id,
          snapshotId: snapshot.id,
          sessionId: review.attachedSessionId,
          sourceKind: input.sourceKind,
          question: cleanBody(input.question, "Question"),
          anchor: input.anchor == null ? undefined : reviewJson(input.anchor),
          context: reviewJson({
            ...(anchorRecord(input.context) ?? {}),
            requestedByActorId: input.actorId,
          }),
          position: (latest?.position ?? 0) + 1,
        },
      });
    });
    await this.emit(review.id, input, "review_inquiry_enqueued", { inquiry });
    void this.advanceQueue(review.id).catch((error: unknown) =>
      console.error("[review] failed to advance inquiry queue", error),
    );
    return inquiry;
  }

  async cancelInquiry(input: ActorInput & { inquiryId: string }) {
    const inquiry = await prisma.reviewInquiry.findFirst({
      where: { id: input.inquiryId, review: { organizationId: input.organizationId } },
    });
    if (!inquiry) throw new NotFoundError("Review inquiry", input.inquiryId);
    if (inquiry.state !== "queued")
      throw new ValidationError("Only queued inquiries can be cancelled");
    const cancelled = await prisma.reviewInquiry.update({
      where: { id: inquiry.id },
      data: { state: "cancelled", completedAt: new Date() },
    });
    await this.emit(inquiry.reviewId, input, "review_inquiry_cancelled", { inquiry: cancelled });
    return cancelled;
  }

  async resolveInquiry(input: ActorInput & { inquiryId: string; resolved: boolean }) {
    const inquiry = await prisma.reviewInquiry.findFirst({
      where: { id: input.inquiryId, review: { organizationId: input.organizationId } },
      include: { review: { select: { attachedSessionId: true } } },
    });
    if (!inquiry) throw new NotFoundError("Review inquiry", input.inquiryId);
    await assertSessionAccess(
      inquiry.review.attachedSessionId,
      input.actorId,
      input.organizationId,
    );
    if (input.resolved && !isFinishedInquiryState(inquiry.state)) {
      throw new ValidationError("Only finished AI conversations can be resolved");
    }
    const updated = await prisma.reviewInquiry.update({
      where: { id: inquiry.id },
      data: input.resolved
        ? { resolvedAt: new Date(), resolvedById: input.actorId }
        : { resolvedAt: null, resolvedById: null },
      include: { responseMessage: true },
    });
    await this.emit(inquiry.reviewId, input, "review_inquiry_resolved", { inquiry: updated });
    return updated;
  }

  async saveGuide(input: ActorInput & { inquiryId: string; content: unknown }) {
    const inquiry = await prisma.reviewInquiry.findFirst({
      where: { id: input.inquiryId, review: { organizationId: input.organizationId } },
      include: { snapshot: true },
    });
    if (!inquiry || inquiry.sourceKind !== "guide_generation")
      throw new NotFoundError("Guide inquiry", input.inquiryId);
    const validated = validateReviewGuide(input.content, inquiry.snapshot.files);
    const guide = await prisma.$transaction(async (tx) => {
      await tx.reviewGuide.updateMany({
        where: { reviewId: inquiry.reviewId, status: "ready" },
        data: { status: "earlier" },
      });
      const latest = await tx.reviewGuide.findFirst({
        where: { snapshotId: inquiry.snapshotId },
        orderBy: { version: "desc" },
      });
      const created = await tx.reviewGuide.create({
        data: {
          reviewId: inquiry.reviewId,
          snapshotId: inquiry.snapshotId,
          generationInquiryId: inquiry.id,
          title: validated.title,
          intent: validated.intent,
          content: reviewJson(validated),
          version: (latest?.version ?? 0) + 1,
        },
      });
      await tx.reviewInquiry.update({
        where: { id: inquiry.id },
        data: { structuredResult: reviewJson(validated) },
      });
      return created;
    });
    await this.emit(inquiry.reviewId, input, "review_guide_saved", { guide });
    return guide;
  }

  async submit(
    input: ActorInput & {
      reviewId: string;
      snapshotId: string;
      threadIds: string[];
      disposition: "comment" | "approve" | "request_changes";
      body?: string | null;
      idempotencyKey: string;
    },
  ) {
    const review = await this.get({ ...input, id: input.reviewId });
    if (review.currentSnapshotId !== input.snapshotId)
      throw new ValidationError("GitHub delivery requires the current snapshot");
    const existing = await prisma.reviewDelivery.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      if (existing.reviewId !== review.id || existing.actorId !== input.actorId)
        throw new AuthorizationError();
      if (existing.status === "succeeded") return existing;
      const existingThreadIds = Array.isArray(existing.threadIds)
        ? existing.threadIds.filter((value): value is string => typeof value === "string")
        : [];
      if (
        existing.snapshotId !== input.snapshotId ||
        existing.disposition !== input.disposition ||
        existingThreadIds.join("\0") !== [...new Set(input.threadIds)].join("\0")
      ) {
        throw new ValidationError("Idempotency key was already used for a different submission");
      }
    }
    const uniqueThreadIds = [...new Set(input.threadIds)];
    const threads = review.threads.filter((thread) => uniqueThreadIds.includes(thread.id));
    if (threads.length !== uniqueThreadIds.length)
      throw new ValidationError("One or more selected threads are invalid");
    if (
      threads.some(
        (thread) => hasProviderDelivery(thread) || thread.originSnapshotId !== input.snapshotId,
      )
    ) {
      throw new ValidationError(
        "Only undelivered threads from the current snapshot can be submitted",
      );
    }
    const delivery = existing
      ? await prisma.reviewDelivery.update({
          where: { id: existing.id },
          data: {
            status: "submitting",
            error: null,
            completedAt: null,
            attempts: { increment: 1 },
          },
        })
      : await prisma.reviewDelivery.create({
          data: {
            reviewId: review.id,
            snapshotId: input.snapshotId,
            actorId: input.actorId,
            idempotencyKey: input.idempotencyKey,
            disposition: input.disposition,
            threadIds: uniqueThreadIds,
            body: input.body,
            status: "submitting",
            attempts: 1,
          },
        });
    await this.emit(review.id, input, "review_delivery_started", { delivery });
    try {
      const token = await this.githubToken(input.actorId);
      const pull = await this.provider.resolvePullRequest(review.pullRequestUrl, token);
      if (pull.headSha !== review.currentSnapshot?.headSha)
        throw new ValidationError("The pull request has new commits; refresh the review first");
      const result = await this.provider.submitReview({
        pullRequest: pull,
        token,
        disposition: input.disposition,
        body: [
          input.body?.trim(),
          ...threads
            .filter((thread) => thread.scope === "general")
            .map(
              (thread) =>
                `${thread.comments
                  .filter((comment) => !comment.deletedAt)
                  .map((comment) => comment.body)
                  .join("\n\n")}\n\n<!-- trace-thread:${thread.id} -->`,
            ),
        ]
          .filter(Boolean)
          .join("\n\n"),
        idempotencyKey: input.idempotencyKey,
        comments: threads.flatMap((thread) => {
          const anchor = anchorRecord(thread.anchor);
          const body = thread.comments
            .filter((comment) => !comment.deletedAt)
            .map((comment) => comment.body)
            .join("\n\n");
          if (!anchor || typeof anchor.filePath !== "string") return [];
          return [
            {
              threadId: thread.id,
              body,
              path: anchor.filePath,
              ...(thread.scope === "file"
                ? { subjectType: "file" as const }
                : {
                    side: anchor.side === "base" ? ("LEFT" as const) : ("RIGHT" as const),
                    line: Number(anchor.endLine),
                    startLine: Number(anchor.startLine),
                  }),
            },
          ];
        }),
      });
      const completed = await prisma.$transaction(async (tx) => {
        for (const thread of threads) {
          await tx.reviewThread.update({
            where: { id: thread.id },
            data: {
              deliveryStatus: "delivered",
              providerReviewId: result.reviewId,
              providerCommentId: result.commentIds[thread.id],
              deliveredAt: new Date(),
              deliveryError: null,
            },
          });
        }
        return tx.reviewDelivery.update({
          where: { id: delivery.id },
          data: {
            status: "succeeded",
            providerReviewId: result.reviewId,
            providerCommentIds: result.commentIds,
            completedAt: new Date(),
          },
        });
      });
      const deliveredThreads = await prisma.reviewThread.findMany({
        where: { id: { in: uniqueThreadIds } },
        include: {
          author: true,
          comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
        },
      });
      await this.emit(review.id, input, "review_delivery_succeeded", {
        delivery: completed,
        threads: deliveredThreads,
      });
      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await prisma.$transaction(async (tx) => {
        await tx.reviewThread.updateMany({
          where: { id: { in: uniqueThreadIds }, deliveryStatus: { not: "delivered" } },
          data: { deliveryStatus: "delivery_failed", deliveryError: message },
        });
        return tx.reviewDelivery.update({
          where: { id: delivery.id },
          data: { status: "failed", error: message, completedAt: new Date() },
        });
      });
      const failedThreads = await prisma.reviewThread.findMany({
        where: { id: { in: uniqueThreadIds } },
        include: {
          author: true,
          comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
        },
      });
      await this.emit(review.id, input, "review_delivery_failed", {
        delivery: failed,
        threads: failedThreads,
      });
      return failed;
    }
  }

  async handleSessionAssistantEvent(event: PrismaEvent): Promise<void> {
    if (event.scopeType !== "session" || event.eventType !== "session_output") return;
    const payload = anchorRecord(event.payload);
    if (payload?.type !== "assistant") return;
    const inquiry = await prisma.reviewInquiry.findFirst({
      where: { sessionId: event.scopeId, state: "running" },
      orderBy: { startedAt: "asc" },
    });
    if (!inquiry) return;
    const response = await prisma.sessionMessage.findUnique({ where: { sourceEventId: event.id } });
    if (!response) return;
    const completed = await prisma.reviewInquiry.update({
      where: { id: inquiry.id },
      data: { state: "completed", responseMessageId: response.id, completedAt: new Date() },
    });
    await eventService.create({
      organizationId: event.organizationId,
      scopeType: "review",
      scopeId: inquiry.reviewId,
      eventType: "review_inquiry_completed",
      payload: reviewJson({ inquiry: { ...completed, responseMessage: response } }),
      actorType: "agent",
      actorId: event.actorId,
    });
    if (inquiry.sourceKind === "guide_generation") {
      try {
        const content = parseGuideResponse(response.text);
        await this.saveGuide({
          organizationId: event.organizationId,
          actorId: event.actorId,
          actorType: "agent",
          inquiryId: inquiry.id,
          content,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failedInquiry = await prisma.reviewInquiry.update({
          where: { id: inquiry.id },
          data: { state: "failed", error: message, completedAt: new Date() },
        });
        await eventService.create({
          organizationId: event.organizationId,
          scopeType: "review",
          scopeId: inquiry.reviewId,
          eventType: "review_guide_failed",
          payload: reviewJson({ inquiry: failedInquiry, error: message }),
          actorType: "agent",
          actorId: event.actorId,
        });
      }
    }
    await this.advanceQueue(inquiry.reviewId);
  }

  private async captureSnapshot(
    review: ReviewWithInclude,
    pull: ResolvedPullRequest,
    actor: ActorInput,
  ) {
    const existing = review.snapshots.find(
      (snapshot) => snapshot.baseSha === pull.baseSha && snapshot.headSha === pull.headSha,
    );
    if (existing) {
      const metadataChanged =
        review.title !== pull.title || review.description !== pull.description;
      if (metadataChanged) {
        review = await prisma.review.update({
          where: { id: review.id },
          data: { title: pull.title, description: pull.description },
          include: REVIEW_INCLUDE,
        });
      }
      if (review.currentSnapshotId !== existing.id) {
        await this.markCurrent(review.id, existing.id, actor);
      } else if (metadataChanged) {
        await this.emit(review.id, actor, "review_updated", { review });
      }
      return this.get({ ...actor, id: review.id });
    }
    const snapshotId = randomUUID();
    const body = Buffer.from(
      JSON.stringify({
        version: 1,
        baseSha: pull.baseSha,
        headSha: pull.headSha,
        files: pull.files,
      } satisfies StoredReviewPatch),
    );
    const key = patchKey(review.id, snapshotId);
    await storage.putObject(key, body, "application/json", { ifAbsent: true });
    const updated = await prisma.$transaction(async (tx) => {
      await tx.reviewSnapshot.updateMany({
        where: { reviewId: review.id, status: "current" },
        data: { status: "archived" },
      });
      await tx.reviewGuide.updateMany({
        where: { reviewId: review.id, status: "ready" },
        data: { status: "earlier" },
      });
      const snapshot = await tx.reviewSnapshot.create({
        data: {
          id: snapshotId,
          reviewId: review.id,
          baseSha: pull.baseSha,
          headSha: pull.headSha,
          files: fileSummaries(pull),
          patchStorageKey: key,
          patchChecksum: checksum(body),
          patchByteLength: body.byteLength,
          providerMetadata: reviewJson({
            number: pull.number,
            url: pull.url,
            description: pull.description,
            baseRef: pull.baseRef,
            headRef: pull.headRef,
          }),
          createdById: actor.actorId,
        },
      });
      const anchoredThreads = await tx.reviewThread.findMany({
        where: {
          reviewId: review.id,
          originSnapshotId: { not: snapshot.id },
          anchor: { not: Prisma.JsonNull },
        },
        select: { id: true, anchor: true, deliveryStatus: true },
      });
      for (const thread of anchoredThreads) {
        const original = anchorRecord(thread.anchor);
        if (!original) continue;
        await tx.reviewThread.update({
          where: { id: thread.id },
          data: {
            anchor: reviewJson({ ...original, status: "outdated" }),
            ...(thread.deliveryStatus === "delivered" ? {} : { deliveryStatus: "outdated" }),
          },
        });
      }
      await tx.review.update({
        where: { id: review.id },
        data: {
          currentSnapshotId: snapshot.id,
          title: pull.title,
          description: pull.description,
        },
      });
      return snapshot;
    });
    const latest = await this.get({ ...actor, id: review.id });
    await this.emit(review.id, actor, "review_snapshot_created", {
      snapshot: updated,
      review: latest,
    });
    return latest;
  }

  private async markCurrent(reviewId: string, snapshotId: string, actor: ActorInput) {
    await prisma.$transaction(async (tx) => {
      await tx.reviewSnapshot.updateMany({
        where: { reviewId, status: "current" },
        data: { status: "archived" },
      });
      await tx.reviewSnapshot.update({ where: { id: snapshotId }, data: { status: "current" } });
      await tx.review.update({ where: { id: reviewId }, data: { currentSnapshotId: snapshotId } });
    });
    const review = await this.get({ ...actor, id: reviewId });
    await this.emit(reviewId, actor, "review_snapshot_marked_current", { review });
  }

  private async advanceQueue(reviewId: string) {
    const running = await prisma.reviewInquiry.findFirst({ where: { reviewId, state: "running" } });
    if (running) return;
    const inquiry = await prisma.reviewInquiry.findFirst({
      where: { reviewId, state: "queued" },
      orderBy: { position: "asc" },
      include: { review: true, snapshot: true },
    });
    if (!inquiry) return;
    const claimed = await prisma.reviewInquiry.updateMany({
      where: { id: inquiry.id, state: "queued" },
      data: { state: "running", startedAt: new Date() },
    });
    if (claimed.count !== 1) return;
    try {
      const context = anchorRecord(inquiry.context);
      const requestingActorId =
        typeof context?.requestedByActorId === "string"
          ? context.requestedByActorId
          : inquiry.review.createdById;
      const event = await sessionService.sendMessage({
        sessionId: inquiry.sessionId,
        text: this.inquiryPrompt(inquiry),
        actorType: "user",
        actorId: requestingActorId,
        interactionMode: "ask",
        clientMutationId: `review-inquiry:${inquiry.id}`,
        clientSource: "internal:review",
      });
      const message = await prisma.sessionMessage.findUnique({
        where: { sourceEventId: event.id },
      });
      const started = await prisma.reviewInquiry.update({
        where: { id: inquiry.id },
        data: { sessionMessageId: message?.id },
      });
      await eventService.create({
        organizationId: inquiry.review.organizationId,
        scopeType: "review",
        scopeId: reviewId,
        eventType: "review_inquiry_started",
        payload: reviewJson({ inquiry: started }),
        actorType: "user",
        actorId: requestingActorId,
      });
    } catch (error) {
      const failed = await prisma.reviewInquiry.update({
        where: { id: inquiry.id },
        data: {
          state: "failed",
          error: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        },
      });
      await eventService.create({
        organizationId: inquiry.review.organizationId,
        scopeType: "review",
        scopeId: reviewId,
        eventType: "review_inquiry_failed",
        payload: reviewJson({ inquiry: failed }),
        actorType: "system",
        actorId: inquiry.review.createdById,
      });
      await this.advanceQueue(reviewId);
    }
  }

  private inquiryPrompt(
    inquiry: Prisma.ReviewInquiryGetPayload<{ include: { review: true; snapshot: true } }>,
  ): string {
    const anchor = anchorRecord(inquiry.anchor);
    const format =
      inquiry.sourceKind === "guide_generation"
        ? guideGenerationInstruction(inquiry.snapshot.files)
        : "Answer concisely in plain text and cite the anchored lines when relevant.";
    return [
      "This is review assistance, not an implementation request.",
      `Review ${inquiry.reviewId}; snapshot ${inquiry.snapshotId}; base ${inquiry.snapshot.baseSha}; head ${inquiry.snapshot.headSha}.`,
      anchor ? `Anchor: ${JSON.stringify(anchor)}` : "Anchor: general review context.",
      `Context: ${JSON.stringify(inquiry.context)}`,
      `Request: ${inquiry.question}`,
      "Read-only: do not edit source, commit, push, or post to GitHub.",
      ...(inquiry.sourceKind === "guide_generation" ? [REVIEW_GUIDE_SKILL_INSTRUCTION] : []),
      format,
    ].join("\n\n");
  }

  private async thread(id: string, actor: ActorInput) {
    const thread = await prisma.reviewThread.findFirst({
      where: { id, review: { organizationId: actor.organizationId } },
    });
    if (!thread) throw new NotFoundError("Review thread", id);
    const review = await prisma.review.findUniqueOrThrow({
      where: { id: thread.reviewId },
      select: { attachedSessionId: true },
    });
    await assertSessionAccess(review.attachedSessionId, actor.actorId, actor.organizationId);
    return thread;
  }

  private async githubToken(userId: string): Promise<string> {
    const token = (await apiTokenService.getDecryptedTokens(userId)).github;
    if (!token) throw new ValidationError("Connect GitHub before opening or submitting a review");
    return token;
  }

  private emit(
    reviewId: string,
    actor: ActorInput,
    eventType: Prisma.EventCreateInput["eventType"],
    payload: unknown,
  ) {
    return eventService.create({
      organizationId: actor.organizationId,
      scopeType: "review",
      scopeId: reviewId,
      eventType: eventType as never,
      payload: reviewJson(payload),
      actorType: actor.actorType,
      actorId: actor.actorId,
    });
  }
}

export const reviewService = new ReviewService();
