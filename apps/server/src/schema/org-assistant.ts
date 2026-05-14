import type { Context } from "../context.js";
import { AuthenticationError } from "../lib/errors.js";
import { assertOrgAccess, requireOrgContext } from "../lib/require-org.js";
import { orgAssistantService } from "../services/org-assistant.js";
import { suggestedActionService } from "../services/suggested-action.js";
import { resolveActor } from "../services/actor.js";

export const orgAssistantQueries = {
  orgAssistantSession: (
    _: unknown,
    args: { organizationId: string },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    assertOrgAccess(ctx, args.organizationId);
    return orgAssistantService.getOrCreateOrgAssistantSession(args.organizationId, ctx.userId);
  },
  orgAssistantSessions: (
    _: unknown,
    args: { organizationId: string },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    assertOrgAccess(ctx, args.organizationId);
    return orgAssistantService.listOrgAssistantSessions(args.organizationId, ctx.userId);
  },
  suggestedAction: (_: unknown, args: { id: string }, ctx: Context) => {
    return suggestedActionService.get(args.id, requireOrgContext(ctx));
  },
};

export const orgAssistantMutations = {
  createOrgAssistantSession: (
    _: unknown,
    args: { organizationId: string },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    assertOrgAccess(ctx, args.organizationId);
    return orgAssistantService.createOrgAssistantSession(args.organizationId, ctx.userId);
  },
  approveSuggestedAction: (_: unknown, args: { id: string }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    return suggestedActionService.approve(args.id, requireOrgContext(ctx), ctx.userId);
  },
  dismissSuggestedAction: (_: unknown, args: { id: string }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    return suggestedActionService.dismiss(args.id, requireOrgContext(ctx), ctx.userId);
  },
};

export const orgAssistantTypeResolvers = {
  SuggestedAction: {
    proposedBy: (
      action: { proposedByActorType: string; proposedByActorId: string },
      _args: unknown,
      ctx: Context,
    ) =>
      resolveActor(
        { actorType: action.proposedByActorType, actorId: action.proposedByActorId },
        ctx.userLoader,
      ),
    approvedBy: (
      action: { approvedByActorType?: string | null; approvedByActorId?: string | null },
      _args: unknown,
      ctx: Context,
    ) =>
      action.approvedByActorType && action.approvedByActorId
        ? resolveActor(
            { actorType: action.approvedByActorType, actorId: action.approvedByActorId },
            ctx.userLoader,
          )
        : null,
    dismissedBy: (
      action: { dismissedByActorType?: string | null; dismissedByActorId?: string | null },
      _args: unknown,
      ctx: Context,
    ) =>
      action.dismissedByActorType && action.dismissedByActorId
        ? resolveActor(
            { actorType: action.dismissedByActorType, actorId: action.dismissedByActorId },
            ctx.userLoader,
          )
        : null,
  },
};
