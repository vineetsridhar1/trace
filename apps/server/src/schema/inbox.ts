import type { Context } from "../context.js";
import type { InboxItemStatus } from "@prisma/client";
import { inboxService } from "../services/inbox.js";
import { requireOrgContext } from "../lib/require-org.js";
import { ActionExecutor, type PlannedAction, type AgentContext } from "../agent/executor.js";
import { ticketService } from "../services/ticket.js";
import { chatService } from "../services/chat.js";
import { sessionService } from "../services/session.js";
import { recordDismissal } from "../agent/policy-engine.js";

/** Shared executor — reused across resolver calls to preserve idempotency state. */
const executor = new ActionExecutor({
  ticketService,
  chatService,
  sessionService,
  inboxService,
});

export const inboxQueries = {
  inboxItems: (_: unknown, args: { organizationId: string; status?: InboxItemStatus }, ctx: Context) => {
    return inboxService.listForUser(args.organizationId, ctx.userId, args.status ?? undefined);
  },
};

export const inboxMutations = {
  dismissInboxItem: (_: unknown, args: { id: string }, ctx: Context) => {
    return inboxService.dismiss(args.id, ctx.userId, requireOrgContext(ctx));
  },

  acceptAgentSuggestion: async (
    _: unknown,
    args: { inboxItemId: string; edits?: Record<string, unknown> | null },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);

    // 1. Accept the suggestion (marks as resolved — does NOT merge edits into payload)
    const item = await inboxService.acceptSuggestion(
      args.inboxItemId,
      ctx.userId,
      orgId,
    );

    // 2. Extract the stored action from the payload and execute it
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const actionType = payload.actionType as string | undefined;
    const storedArgs = payload.args as Record<string, unknown> | undefined;

    if (actionType && storedArgs) {
      // Merge user edits into the action args (single merge point)
      const finalArgs = args.edits
        ? { ...storedArgs, ...args.edits }
        : storedArgs;

      const action: PlannedAction = { actionType, args: finalArgs };
      const agentCtx: AgentContext = {
        organizationId: orgId,
        agentId: (payload.agentId as string) ?? "system",
        triggerEventId: (payload.triggerEventId as string) ?? item.sourceId,
      };

      await executor.execute(action, agentCtx);
    }

    return item;
  },

  dismissAgentSuggestion: async (
    _: unknown,
    args: { inboxItemId: string },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    const item = await inboxService.dismissSuggestion(args.inboxItemId, ctx.userId, orgId);

    // Record dismissal for the policy engine's 24h cooldown
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const actionType = payload.actionType as string | undefined;
    if (actionType) {
      const scopeType = (payload.scopeType as string) ?? "system";
      const scopeId = (payload.scopeId as string) ?? orgId;
      recordDismissal({
        organizationId: orgId,
        scopeType,
        scopeId,
        actionType,
      });
    }

    return item;
  },
};
