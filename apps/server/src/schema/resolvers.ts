import { DateTimeScalar, JSONScalar } from "./scalars.js";
import { organizationQueries, organizationMutations, organizationTypeResolvers, repoResolvers } from "./organization.js";
import { orgMemberService } from "../services/org-member.js";
import { channelQueries, channelMutations, channelSubscriptions, channelTypeResolvers } from "./channel.js";
import { channelGroupQueries, channelGroupMutations } from "./channelGroup.js";
import { sessionQueries, sessionMutations, sessionSubscriptions, sessionTypeResolvers } from "./session.js";
import { ticketQueries, ticketMutations, ticketSubscriptions, ticketTypeResolvers } from "./ticket.js";
import { eventQueries, eventSubscriptions } from "./event.js";
import { inboxQueries, inboxMutations } from "./inbox.js";
import { apiTokenQueries, apiTokenMutations } from "./api-token.js";
import { terminalQueries, terminalMutations } from "./terminal.js";
import { chatQueries, chatMutations, chatSubscriptions, chatTypeResolvers } from "./chat.js";
import { participantQueries, participantMutations, participantTypeResolvers } from "./participant.js";
import { threadQueries } from "./thread.js";
import { agentIdentityQueries, agentIdentityMutations, agentIdentityTypeResolvers } from "./agent-identity.js";
import { agentDebugQueries } from "./agent-debug.js";
import { scopeAutonomyQueries, scopeAutonomyMutations } from "./scope-autonomy.js";
import type { Context } from "../context.js";
import { resolveActor } from "../services/actor.js";

export const resolvers = {
  DateTime: DateTimeScalar,
  JSON: JSONScalar,

  ...repoResolvers,
  ...organizationTypeResolvers,
  ...channelTypeResolvers,
  ...chatTypeResolvers,
  ...participantTypeResolvers,
  ...ticketTypeResolvers,
  ...sessionTypeResolvers,
  ...agentIdentityTypeResolvers,

  User: {
    organizations: (user: { id: string }) => orgMemberService.getUserOrgs(user.id),
  },

  Event: {
    actor: (event: { actorType: string; actorId: string }, _args: unknown, ctx: Context) =>
      resolveActor(event, ctx.userLoader),
  },

  Query: {
    ...organizationQueries,
    ...channelQueries,
    ...channelGroupQueries,
    ...sessionQueries,
    ...ticketQueries,
    ...eventQueries,
    ...inboxQueries,
    ...apiTokenQueries,
    ...terminalQueries,
    ...chatQueries,
    ...participantQueries,
    ...threadQueries,
    ...agentIdentityQueries,
    ...agentDebugQueries,
    ...scopeAutonomyQueries,
  },

  Mutation: {
    ...organizationMutations,
    ...channelMutations,
    ...channelGroupMutations,
    ...sessionMutations,
    ...ticketMutations,
    ...inboxMutations,
    ...apiTokenMutations,
    ...terminalMutations,
    ...chatMutations,
    ...participantMutations,
    ...agentIdentityMutations,
    ...scopeAutonomyMutations,
  },

  Subscription: {
    ...channelSubscriptions,
    ...sessionSubscriptions,
    ...ticketSubscriptions,
    ...chatSubscriptions,
    ...eventSubscriptions,
  },
};
