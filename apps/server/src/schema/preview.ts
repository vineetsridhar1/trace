import type { Context } from "../context.js";
import type { CreatePreviewInput } from "@trace/gql";
import { AuthenticationError } from "../lib/errors.js";
import { requireOrgContext } from "../lib/require-org.js";
import { previewService } from "../services/preview.js";

export const previewQueries = {
  sessionPreviews: async (_: unknown, args: { sessionId: string }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return previewService.listForSession({
      sessionId: args.sessionId,
      organizationId: orgId,
      actorId: ctx.userId,
    });
  },
};

export const previewMutations = {
  createPreview: async (_: unknown, args: { input: CreatePreviewInput }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return previewService.createPreview({
      organizationId: orgId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
      data: args.input,
    });
  },
  stopPreview: async (_: unknown, args: { id: string }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    const orgId = requireOrgContext(ctx);
    return previewService.stopPreview({
      id: args.id,
      organizationId: orgId,
      actorType: ctx.actorType,
      actorId: ctx.userId,
    });
  },
};
