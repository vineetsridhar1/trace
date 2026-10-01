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
import { reconcileReviewAnchor } from "./review-anchor.js";
import { sessionService } from "./session.js";
import {
  guideGenerationInstruction,
  parseGuideResponse,
  REVIEW_GUIDE_SKILL_INSTRUCTION,
  validateReviewGuide,
} from "./review-guide.js";

/**
 * A review question runs a full coding-session turn, which can legitimately involve many tool
 * calls, so this is a wedge detector rather than a latency budget.
 */
const INQUIRY_TURN_TIMEOUT_MS = 30 * 60 * 1000;
const INQUIRY_TIMEOUT_MESSAGE = "The coding session never finished this turn";
const MAX_QUEUE_ADVANCES_PER_PASS = 50;
/** How long a GitHub submission may be in flight before a retry is allowed to supersede it. */
const DELIVERY_IN_FLIGHT_TIMEOUT_MS = 2 * 60 * 1000;
const SYSTEM_ACTOR_ID = "system";

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

const THREAD_INCLUDE = {
  author: true,
  comments: { include: { author: true }, orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.ReviewThreadInclude;

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

export function threadAppliesToSnapshot(
  thread: { scope: string; anchor: unknown },
  snapshotId: string,
): boolean {
  // Guide annotations are Trace-internal commentary on the walkthrough, never PR feedback.
  if (thread.scope === "guide_explanation") return false;
  const anchor = anchorRecord(thread.anchor);
  // Review-level comments are not tied to code, so a new snapshot cannot invalidate them.
  if (!anchor) return true;
  return anchor.snapshotId === snapshotId && anchor.status !== "outdated";
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

type ReviewEventEntity = Omit<
  ReviewWithInclude,
  | "snapshots"
  | "threads"
  | "inquiries"
  | "guides"
  | "repository"
  | "channel"
  | "sourceSessionGroup"
  | "attachedSession"
>;

/**
 * Projects a loaded review down to what an event needs to carry. Every review event is persisted
 * forever and republished on the org stream, so embedding the transitive closure — all snapshots,
 * threads, comments, inquiries and guide bodies — would grow each event without bound. Related
 * entities reach the client through their own payloads; the client only reads scalars and
 * `currentSnapshot` off this entity.
 */
function reviewEntity(review: ReviewWithInclude): ReviewEventEntity {
  const {
    snapshots: _snapshots,
    threads: _threads,
    inquiries: _inquiries,
    guides: _guides,
    repository: _repository,
    channel: _channel,
    sourceSessionGroup: _sourceSessionGroup,
    attachedSession: _attachedSession,
    ...entity
  } = review;
  return entity;
}

function reviewPayload(review: { id: string }): Prisma.InputJsonValue {
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
  // Built field-by-field rather than spread: the anchor is client-supplied JSON that reconciliation
  // later reads back, so only the known keys are allowed to persist.
  return reviewJson({
    snapshotId,
    filePath: anchor.filePath,
    side: anchor.side,
    startLine: anchor.startLine,
    endLine: anchor.endLine,
    status: "current",
    originalLine: Number.isInteger(anchor.originalLine) ? anchor.originalLine : anchor.startLine,
    selectedText: typeof anchor.selectedText === "string" ? anchor.selectedText : "",
    context: typeof anchor.context === "string" ? anchor.context : null,
    hunkId: typeof anchor.hunkId === "string" ? anchor.hunkId : null,
    baseBlobId: typeof anchor.baseBlobId === "string" ? anchor.baseBlobId : null,
    headBlobId: typeof anchor.headBlobId === "string" ? anchor.headBlobId : null,
  });
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
        payload: reviewPayload(reviewEntity(review)),
        actorType: input.actorType,
        actorId: input.actorId,
      });
    } else if (review.attachedSessionId !== session.id || review.status !== "open") {
      review = await prisma.review.update({
        where: { id: review.id },
        data: { attachedSessionId: session.id, status: "open" },
        include: REVIEW_INCLUDE,
      });
      await this.emit(review.id, input, "review_updated", { review: reviewEntity(review) });
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
      include: THREAD_INCLUDE,
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
      include: THREAD_INCLUDE,
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
      include: THREAD_INCLUDE,
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
      include: THREAD_INCLUDE,
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
      include: THREAD_INCLUDE,
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
      include: THREAD_INCLUDE,
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
      include: { review: { select: { attachedSessionId: true } } },
    });
    if (!inquiry) throw new NotFoundError("Review inquiry", input.inquiryId);
    await assertSessionAccess(
      inquiry.review.attachedSessionId,
      input.actorId,
      input.organizationId,
    );
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
      select: { review: { select: { attachedSessionId: true } } },
    });
    if (!inquiry) throw new NotFoundError("Guide inquiry", input.inquiryId);
    await assertSessionAccess(
      inquiry.review.attachedSessionId,
      input.actorId,
      input.organizationId,
    );
    return this.persistGuide(input);
  }

  /**
   * Shared by the client mutation and by turn correlation. The correlation path runs as the system
   * actor, which has no session membership, so authorization lives in `saveGuide` instead.
   */
  private async persistGuide(input: ActorInput & { inquiryId: string; content: unknown }) {
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
      // A delivery already in flight must not be re-sent. The provider's marker scan would usually
      // catch the duplicate, but only after GitHub has already accepted the first review.
      if (
        existing.status === "submitting" &&
        Date.now() - (existing.startedAt ?? existing.createdAt).getTime() <
          DELIVERY_IN_FLIGHT_TIMEOUT_MS
      ) {
        throw new ValidationError("This review is already being sent to GitHub");
      }
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
        (thread) =>
          hasProviderDelivery(thread) || !threadAppliesToSnapshot(thread, input.snapshotId),
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
            startedAt: new Date(),
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
            startedAt: new Date(),
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
        include: THREAD_INCLUDE,
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
        include: THREAD_INCLUDE,
      });
      await this.emit(review.id, input, "review_delivery_failed", {
        delivery: failed,
        threads: failedThreads,
      });
      return failed;
    }
  }

  /**
   * Turn-terminal correlation. Coding tools emit one assistant output per message in a turn, so the
   * first of them is usually preamble before a tool call — never the answer. Every adapter emits a
   * single `result` output when the turn actually ends, so that is the only safe completion signal:
   * correlating earlier would answer with preamble and would release the FIFO slot while the
   * session is still working.
   */
  async handleSessionOutputEvent(event: PrismaEvent): Promise<void> {
    if (event.scopeType !== "session" || event.eventType !== "session_output") return;
    const payload = anchorRecord(event.payload);
    if (payload?.type !== "result") return;
    const inquiry = await prisma.reviewInquiry.findFirst({
      where: { sessionId: event.scopeId, state: "running" },
      orderBy: { startedAt: "asc" },
    });
    if (!inquiry) return;
    const actor = {
      organizationId: event.organizationId,
      actorId: event.actorId,
      actorType: "agent" as const,
    };

    // Only messages from this inquiry's own turn can be its answer. `startedAt` is stamped when the
    // inquiry is claimed, before its prompt is sent, so it bounds the turn from below.
    const turnMessages = inquiry.startedAt
      ? await prisma.sessionMessage.findMany({
          where: {
            sessionId: event.scopeId,
            role: "assistant",
            createdAt: { gte: inquiry.startedAt },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

    if (payload.subtype === "error") {
      await this.failInquiry(inquiry.id, "The coding session ended this turn with an error", actor);
      await this.advanceSession(event.scopeId);
      return;
    }
    if (turnMessages.length === 0) {
      await this.failInquiry(inquiry.id, "The coding session produced no answer", actor);
      await this.advanceSession(event.scopeId);
      return;
    }

    // Guides must parse, and agents often append a closing remark after the JSON, so search the
    // turn newest-first for the message that actually carries the payload.
    let guideContent: unknown;
    let response = turnMessages[turnMessages.length - 1]!;
    if (inquiry.sourceKind === "guide_generation") {
      const parsed = [...turnMessages].reverse().flatMap((message) => {
        try {
          return [{ message, content: parseGuideResponse(message.text) }];
        } catch {
          return [];
        }
      })[0];
      if (!parsed) {
        await this.failInquiry(
          inquiry.id,
          "The coding session did not return Guide JSON for this turn",
          actor,
        );
        await this.advanceSession(event.scopeId);
        return;
      }
      response = parsed.message;
      guideContent = parsed.content;
    }

    // Guarded on `running` so a duplicate `result` cannot complete the inquiry twice, which would
    // double-save the Guide and advance the queue twice.
    const claimed = await prisma.reviewInquiry.updateMany({
      where: { id: inquiry.id, state: "running" },
      data: { state: "completed", responseMessageId: response.id, completedAt: new Date() },
    });
    if (claimed.count !== 1) return;
    const completed = await prisma.reviewInquiry.findUniqueOrThrow({ where: { id: inquiry.id } });
    await this.emit(inquiry.reviewId, actor, "review_inquiry_completed", {
      inquiry: { ...completed, responseMessage: response },
    });

    if (inquiry.sourceKind === "guide_generation") {
      try {
        await this.persistGuide({ ...actor, inquiryId: inquiry.id, content: guideContent });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failedInquiry = await prisma.reviewInquiry.update({
          where: { id: inquiry.id },
          data: { state: "failed", error: message, completedAt: new Date() },
        });
        await this.emit(inquiry.reviewId, actor, "review_guide_failed", {
          inquiry: failedInquiry,
          error: message,
        });
      }
    }
    await this.advanceSession(event.scopeId);
  }

  /** Releases a wedged or unanswerable inquiry so the session's FIFO slot is never lost. */
  private async failInquiry(inquiryId: string, message: string, actor: ActorInput) {
    const failed = await prisma.reviewInquiry.updateMany({
      where: { id: inquiryId, state: { in: ["queued", "running"] } },
      data: { state: "failed", error: message, completedAt: new Date() },
    });
    if (failed.count !== 1) return;
    const inquiry = await prisma.reviewInquiry.findUniqueOrThrow({ where: { id: inquiryId } });
    await this.emit(inquiry.reviewId, actor, "review_inquiry_failed", { inquiry });
  }

  /**
   * Fails inquiries whose turn never produced a `result` and restarts any session whose queue has
   * work but nothing in flight. Without this a crashed server or dead agent wedges a review's queue
   * permanently, because dispatch is otherwise only triggered by enqueue and completion.
   */
  async recoverStuckInquiries(): Promise<void> {
    const stale = await prisma.reviewInquiry.findMany({
      where: {
        state: "running",
        startedAt: { lt: new Date(Date.now() - INQUIRY_TURN_TIMEOUT_MS) },
      },
      select: { id: true, sessionId: true, review: { select: { organizationId: true } } },
    });
    for (const inquiry of stale) {
      await this.failInquiry(inquiry.id, INQUIRY_TIMEOUT_MESSAGE, {
        organizationId: inquiry.review.organizationId,
        actorId: SYSTEM_ACTOR_ID,
        actorType: "system",
      });
    }
    const pending = await prisma.reviewInquiry.groupBy({
      by: ["sessionId"],
      where: { state: "queued" },
    });
    for (const group of pending) {
      await this.advanceSession(group.sessionId).catch((error: unknown) =>
        console.error("[review] failed to advance inquiry queue", error),
      );
    }
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
        await this.emit(review.id, actor, "review_updated", { review: reviewEntity(review) });
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
    // Matching every anchor against the new patch is CPU-bound and one write per thread, so it is
    // resolved before the transaction opens — holding an interactive transaction across it risks
    // the transaction timeout on reviews with many threads.
    const reconciledThreads = await this.reconcileAnchors(review.id, snapshotId, pull.files);
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
      for (const thread of reconciledThreads) {
        await tx.reviewThread.update({ where: { id: thread.id }, data: thread.data });
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
      review: reviewEntity(latest),
      threads: reconciledThreads.length
        ? await prisma.reviewThread.findMany({
            where: { id: { in: reconciledThreads.map((thread) => thread.id) } },
            include: THREAD_INCLUDE,
          })
        : [],
    });
    return latest;
  }

  /**
   * Re-points each live anchor at the incoming snapshot. Origin stays immutable: a thread is only
   * excluded from delivery when its code genuinely no longer exists, and a thread previously marked
   * outdated becomes eligible again if its code reappears.
   */
  private async reconcileAnchors(
    reviewId: string,
    snapshotId: string,
    files: ResolvedPullRequest["files"],
  ) {
    const threads = await prisma.reviewThread.findMany({
      where: {
        reviewId,
        originSnapshotId: { not: snapshotId },
        anchor: { not: Prisma.JsonNull },
      },
      select: { id: true, anchor: true, scope: true, deliveryStatus: true },
    });
    return threads.flatMap((thread) => {
      const original = anchorRecord(thread.anchor);
      if (!original) return [];
      const reconciled = reconcileReviewAnchor(original, thread.scope, snapshotId, files);
      const outdated = reconciled.status === "outdated";
      return [
        {
          id: thread.id,
          data: {
            anchor: reviewJson(reconciled),
            ...(thread.deliveryStatus === "delivered"
              ? {}
              : outdated
                ? { deliveryStatus: "outdated" as const }
                : thread.deliveryStatus === "outdated"
                  ? { deliveryStatus: "trace_only" as const }
                  : {}),
          },
        },
      ];
    });
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
    await this.emit(reviewId, actor, "review_snapshot_marked_current", {
      review: reviewEntity(review),
    });
  }

  private async advanceQueue(reviewId: string) {
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { attachedSessionId: true },
    });
    if (review) await this.advanceSession(review.attachedSessionId);
  }

  /**
   * Dispatch is gated on the attached *session*, not the review: two reviews can share one coding
   * session, and sending both their prompts at once would interleave two turns in one transcript.
   * Ordering by enqueue time keeps each review's own queue FIFO while serializing across them.
   */
  private async advanceSession(sessionId: string) {
    // Bounded rather than recursive: a dead session can fail every queued item in one pass.
    for (let dispatched = 0; dispatched < MAX_QUEUE_ADVANCES_PER_PASS; dispatched += 1) {
      const running = await prisma.reviewInquiry.findFirst({
        where: { sessionId, state: "running" },
        orderBy: { startedAt: "asc" },
        select: { id: true, startedAt: true, review: { select: { organizationId: true } } },
      });
      if (running) {
        const startedAt = running.startedAt?.getTime() ?? 0;
        if (Date.now() - startedAt < INQUIRY_TURN_TIMEOUT_MS) return;
        await this.failInquiry(running.id, INQUIRY_TIMEOUT_MESSAGE, {
          organizationId: running.review.organizationId,
          actorId: SYSTEM_ACTOR_ID,
          actorType: "system",
        });
      }
      const inquiry = await prisma.reviewInquiry.findFirst({
        where: { sessionId, state: "queued" },
        orderBy: [{ createdAt: "asc" }, { position: "asc" }],
        include: { review: true, snapshot: true },
      });
      if (!inquiry) return;
      const claimed = await prisma.reviewInquiry.updateMany({
        where: { id: inquiry.id, state: "queued" },
        data: { state: "running", startedAt: new Date() },
      });
      if (claimed.count !== 1) return;
      const context = anchorRecord(inquiry.context);
      const requestingActorId =
        typeof context?.requestedByActorId === "string"
          ? context.requestedByActorId
          : inquiry.review.createdById;
      try {
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
        await this.emit(
          inquiry.reviewId,
          {
            organizationId: inquiry.review.organizationId,
            actorId: requestingActorId,
            actorType: "user",
          },
          "review_inquiry_started",
          { inquiry: started },
        );
        return;
      } catch (error) {
        await this.failInquiry(inquiry.id, error instanceof Error ? error.message : String(error), {
          organizationId: inquiry.review.organizationId,
          actorId: SYSTEM_ACTOR_ID,
          actorType: "system",
        });
      }
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
