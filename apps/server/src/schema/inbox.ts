import type { Context } from "../context.js";
import type { InboxItemStatus } from "@prisma/client";
import { inboxService } from "../services/inbox.js";
import { slackSessionAccessService } from "../services/slack-session-access.js";
import { assertOrgAccess, requireOrgContext } from "../lib/require-org.js";

export const inboxQueries = {
  inboxItems: (
    _: unknown,
    args: { organizationId: string; status?: InboxItemStatus },
    ctx: Context,
  ) => {
    assertOrgAccess(ctx, args.organizationId);
    return inboxService.listForUser(args.organizationId, ctx.userId, args.status ?? undefined);
  },
};

export const inboxMutations = {
  dismissInboxItem: (_: unknown, args: { id: string }, ctx: Context) => {
    return inboxService.dismiss(args.id, ctx.userId, requireOrgContext(ctx));
  },
  approveSlackSessionAccessRequest: (_: unknown, args: { inboxItemId: string }, ctx: Context) => {
    return slackSessionAccessService.approveInboxRequest(args.inboxItemId, ctx.userId);
  },
  denySlackSessionAccessRequest: (_: unknown, args: { inboxItemId: string }, ctx: Context) => {
    return slackSessionAccessService.denyInboxRequest(args.inboxItemId, ctx.userId);
  },
};
