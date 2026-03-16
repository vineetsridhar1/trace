import type { Context } from "../context.js";
import type { InboxItemStatus } from "@prisma/client";
import { inboxService } from "../services/inbox.js";

export const inboxQueries = {
  inboxItems: (_: unknown, args: { organizationId: string; status?: InboxItemStatus }, ctx: Context) => {
    return inboxService.listForUser(args.organizationId, ctx.userId, args.status ?? undefined);
  },
};

export const inboxMutations = {
  dismissInboxItem: (_: unknown, args: { id: string }, ctx: Context) => {
    return inboxService.dismiss(args.id, ctx.userId);
  },
};
