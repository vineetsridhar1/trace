import type { Context } from "../context.js";
import type { ScopeInput, EventType } from "@trace/gql";
import { eventService } from "../services/event.js";
import { pubsub, topics } from "../lib/pubsub.js";

export const eventQueries = {
  events: (_: unknown, args: { organizationId: string; scope?: ScopeInput; types?: EventType[]; after?: Date; limit?: number }, _ctx: Context) => {
    return eventService.query(args.organizationId, {
      scopeType: args.scope?.type,
      scopeId: args.scope?.id,
      types: args.types,
      after: args.after,
      limit: args.limit,
    });
  },
};

export const eventSubscriptions = {
  orgEvents: {
    subscribe: (_: unknown, args: { organizationId: string }, ctx: Context) => {
      if (ctx.organizationId !== args.organizationId) {
        throw new Error("Not authorized for this organization");
      }
      return pubsub.asyncIterator(topics.orgEvents(args.organizationId));
    },
  },
  userNotifications: {
    subscribe: (_: unknown, args: { organizationId: string }, ctx: Context) => {
      return pubsub.asyncIterator(topics.userNotifications(args.organizationId, ctx.userId));
    },
  },
};
