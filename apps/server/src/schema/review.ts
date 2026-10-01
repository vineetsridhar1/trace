import type {
  CreateReviewThreadInput,
  EnqueueReviewInquiryInput,
  ReviewAnchorInput,
  SubmitReviewInput,
} from "@trace/gql";
import type { Context } from "../context.js";
import { AuthenticationError, toGraphQLError } from "../lib/errors.js";
import { requireOrgContext } from "../lib/require-org.js";
import { reviewService } from "../services/review.js";
import { prisma } from "../lib/db.js";

function actor(ctx: Context) {
  if (!ctx.userId) throw new AuthenticationError();
  return {
    organizationId: requireOrgContext(ctx),
    actorId: ctx.userId,
    actorType: ctx.actorType,
  };
}

function mappedAnchor(anchor: ReviewAnchorInput): Record<string, unknown> {
  return {
    snapshotId: anchor.snapshotId,
    filePath: anchor.filePath,
    side: anchor.side,
    startLine: anchor.startLine,
    endLine: anchor.endLine,
    originalLine: anchor.originalLine,
    selectedText: anchor.selectedText,
    context: anchor.context,
    hunkId: anchor.hunkId,
    baseBlobId: anchor.baseBlobId,
    headBlobId: anchor.headBlobId,
  };
}

const mapError = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    throw toGraphQLError(error);
  }
};

export const reviewQueries = {
  review: (_: unknown, args: { id: string }, ctx: Context) =>
    mapError(() => reviewService.get({ ...actor(ctx), id: args.id })),
  reviewForSessionGroup: (_: unknown, args: { sessionGroupId: string }, ctx: Context) =>
    mapError(() =>
      reviewService.getForSessionGroup({ ...actor(ctx), sessionGroupId: args.sessionGroupId }),
    ),
  reviewDiffFile: (_: unknown, args: { snapshotId: string; filePath: string }, ctx: Context) =>
    mapError(() => reviewService.diffFile({ ...actor(ctx), ...args })),
};

export const reviewMutations = {
  openReviewForPullRequest: (
    _: unknown,
    args: { sessionId: string; pullRequestUrl: string },
    ctx: Context,
  ) => mapError(() => reviewService.open({ ...actor(ctx), ...args })),
  refreshReviewSnapshot: (_: unknown, args: { reviewId: string }, ctx: Context) =>
    mapError(() => reviewService.refresh({ ...actor(ctx), reviewId: args.reviewId })),
  createReviewThread: (_: unknown, args: { input: CreateReviewThreadInput }, ctx: Context) =>
    mapError(() =>
      reviewService.createThread({
        ...actor(ctx),
        reviewId: args.input.reviewId,
        snapshotId: args.input.snapshotId,
        scope: args.input.scope,
        body: args.input.body,
        anchor: args.input.anchor ? mappedAnchor(args.input.anchor) : undefined,
        guideChapterId: args.input.guideChapterId,
      }),
    ),
  replyToReviewThread: (_: unknown, args: { threadId: string; body: string }, ctx: Context) =>
    mapError(() => reviewService.reply({ ...actor(ctx), ...args })),
  editReviewComment: (_: unknown, args: { commentId: string; body: string }, ctx: Context) =>
    mapError(() => reviewService.editComment({ ...actor(ctx), ...args })),
  resolveReviewThread: (_: unknown, args: { threadId: string; resolved: boolean }, ctx: Context) =>
    mapError(() => reviewService.resolveThread({ ...actor(ctx), ...args })),
  reanchorReviewThread: (
    _: unknown,
    args: { threadId: string; anchor: ReviewAnchorInput },
    ctx: Context,
  ) =>
    mapError(() =>
      reviewService.reanchor({
        ...actor(ctx),
        threadId: args.threadId,
        anchor: mappedAnchor(args.anchor),
      }),
    ),
  setReviewThreadSelected: (
    _: unknown,
    args: { threadId: string; selected: boolean },
    ctx: Context,
  ) => mapError(() => reviewService.selectThread({ ...actor(ctx), ...args })),
  enqueueReviewInquiry: (_: unknown, args: { input: EnqueueReviewInquiryInput }, ctx: Context) =>
    mapError(() => reviewService.enqueueInquiry({ ...actor(ctx), ...args.input })),
  cancelReviewInquiry: (_: unknown, args: { inquiryId: string }, ctx: Context) =>
    mapError(() => reviewService.cancelInquiry({ ...actor(ctx), ...args })),
  saveReviewGuide: (_: unknown, args: { inquiryId: string; content: unknown }, ctx: Context) =>
    mapError(() => reviewService.saveGuide({ ...actor(ctx), ...args })),
  submitReviewToProvider: (_: unknown, args: { input: SubmitReviewInput }, ctx: Context) =>
    mapError(() => reviewService.submit({ ...actor(ctx), ...args.input })),
};

export const reviewTypeResolvers = {
  ReviewInquiry: {
    sessionMessage: (inquiry: { sessionMessageId?: string | null }) =>
      inquiry.sessionMessageId
        ? prisma.sessionMessage.findUnique({ where: { id: inquiry.sessionMessageId } })
        : null,
    responseMessage: (inquiry: { responseMessageId?: string | null }) =>
      inquiry.responseMessageId
        ? prisma.sessionMessage.findUnique({ where: { id: inquiry.responseMessageId } })
        : null,
  },
};
