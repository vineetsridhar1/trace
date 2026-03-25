import type { OrgAgentStatus, AutonomyMode } from "@prisma/client";
import type { Context } from "../context.js";
import { agentIdentityService } from "../services/agent-identity.js";
import { orgMemberService } from "../services/org-member.js";
import type { OrgAgentSettings } from "../services/agent-identity.js";

export const agentIdentityQueries = {
  agentIdentity: async (_: unknown, args: { organizationId: string }, ctx: Context) => {
    await orgMemberService.assertMembership(ctx.userId, args.organizationId);
    return agentIdentityService.getOrCreate(args.organizationId);
  },
};

export const agentIdentityMutations = {
  updateAgentSettings: async (
    _: unknown,
    args: {
      organizationId: string;
      input: {
        name?: string;
        status?: string;
        autonomyMode?: string;
        soulFile?: string;
        dailyLimitCents?: number;
      };
    },
    ctx: Context,
  ) => {
    await orgMemberService.assertMembership(ctx.userId, args.organizationId);

    return agentIdentityService.update(args.organizationId, {
      ...(args.input.name != null && { name: args.input.name }),
      ...(args.input.status != null && { status: args.input.status as OrgAgentStatus }),
      ...(args.input.autonomyMode != null && { autonomyMode: args.input.autonomyMode as AutonomyMode }),
      ...(args.input.soulFile != null && { soulFile: args.input.soulFile }),
      ...(args.input.dailyLimitCents != null && { dailyLimitCents: args.input.dailyLimitCents }),
    });
  },
};

export const agentIdentityTypeResolvers = {
  AgentIdentity: {
    id: (parent: OrgAgentSettings) => parent.agentId,
    costBudget: (parent: OrgAgentSettings) => parent.costBudget,
  },
};
