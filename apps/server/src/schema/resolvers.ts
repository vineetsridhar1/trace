import { DateTimeScalar, JSONScalar } from "./scalars.js";
import { organizationQueries, organizationMutations } from "./organization.js";
import { channelQueries, channelMutations, channelSubscriptions } from "./channel.js";
import { sessionQueries, sessionMutations, sessionSubscriptions } from "./session.js";
import { ticketQueries, ticketMutations, ticketSubscriptions } from "./ticket.js";
import { eventQueries, eventSubscriptions } from "./event.js";
import { prisma } from "../lib/db.js";

export const resolvers = {
  DateTime: DateTimeScalar,
  JSON: JSONScalar,

  Event: {
    actor: async (event: { actorType: string; actorId: string }) => {
      const actor: { type: string; id: string; name: string | null } = {
        type: event.actorType,
        id: event.actorId,
        name: null,
      };
      if (event.actorType === "user") {
        const user = await prisma.user.findUnique({
          where: { id: event.actorId },
          select: { name: true },
        });
        actor.name = user?.name ?? null;
      }
      return actor;
    },
  },

  Query: {
    ...organizationQueries,
    ...channelQueries,
    ...sessionQueries,
    ...ticketQueries,
    ...eventQueries,
  },

  Mutation: {
    ...organizationMutations,
    ...channelMutations,
    ...sessionMutations,
    ...ticketMutations,
  },

  Subscription: {
    ...channelSubscriptions,
    ...sessionSubscriptions,
    ...ticketSubscriptions,
    ...eventSubscriptions,
  },
};
