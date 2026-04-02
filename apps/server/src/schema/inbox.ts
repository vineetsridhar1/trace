import type { Context } from "../context.js";
import type { InboxItemStatus } from "@prisma/client";
import { inboxService } from "../services/inbox.js";
import { requireOrgContext } from "../lib/require-org.js";
import { ActionExecutor, type PlannedAction, type AgentContext } from "../agent/executor.js";
import { ticketService } from "../services/ticket.js";
import { chatService } from "../services/chat.js";
import { sessionService } from "../services/session.js";
import { channelService } from "../services/channel.js";
import { organizationService } from "../services/organization.js";
import { eventService } from "../services/event.js";
import { recordDismissal } from "../agent/policy-engine.js";

/** Shared executor — reused across resolver calls to preserve idempotency state. */
const executor = new ActionExecutor({
  ticketService,
  chatService,
  channelService,
  sessionService,
  inboxService,
  organizationService,
  eventService,
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

    // 1. Load the suggestion (verify ownership + active status) without resolving yet
    const item = await inboxService.getActiveSuggestion(args.inboxItemId, ctx.userId, orgId);

    // 2. Extract the stored action and execute it BEFORE marking as resolved
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const actionType = payload.actionType as string | undefined;
    const storedArgs = payload.args as Record<string, unknown> | undefined;

    if (actionType && storedArgs) {
      const finalArgs = args.edits
        ? { ...storedArgs, ...args.edits }
        : storedArgs;

      const action: PlannedAction = { actionType, args: finalArgs };
      // Use the accepting user's ID — they're the one approving this action
      const agentCtx: AgentContext = {
        organizationId: orgId,
        agentId: ctx.userId,
        triggerEventId: `accept:${item.id}`,
      };

      const result = await executor.execute(action, agentCtx);
      if (result.status === "failed") {
        throw new Error(`Failed to execute suggestion: ${result.error}`);
      }
    }

    // 3. Only mark as resolved after successful execution
    return inboxService.acceptSuggestion(args.inboxItemId, ctx.userId, orgId);
  },

  dismissAgentSuggestion: async (
    _: unknown,
    args: { inboxItemId: string },
    ctx: Context,
  ) => {
    const orgId = requireOrgContext(ctx);
    const item = await inboxService.dismissSuggestion(args.inboxItemId, ctx.userId, orgId);

    // Record dismissal for the policy engine's 24h cooldown (keyed by itemType)
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const scopeType = (payload.scopeType as string) ?? "system";
    const scopeId = (payload.scopeId as string) ?? orgId;
    await recordDismissal({
      organizationId: orgId,
      scopeType,
      scopeId,
      itemType: item.itemType,
    });

    return item;
  },
};
