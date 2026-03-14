import { DateTimeScalar, JSONScalar } from "./scalars.js";
import { organizationQueries, organizationMutations } from "./organization.js";
import { channelQueries, channelMutations, channelSubscriptions } from "./channel.js";
import { sessionQueries, sessionMutations, sessionSubscriptions } from "./session.js";
import { ticketQueries, ticketMutations, ticketSubscriptions } from "./ticket.js";
import { eventQueries, eventSubscriptions } from "./event.js";

export const resolvers = {
  DateTime: DateTimeScalar,
  JSON: JSONScalar,

  Event: {
    actor: (event: { actorType: string; actorId: string }) => ({
      type: event.actorType,
      id: event.actorId,
    }),
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
