import type { Context } from "../context.js";
import { agentIdentityService } from "../services/agent-identity.js";
import { orgMemberService } from "../services/org-member.js";
import type { AgentIdentity as PrismaAgentIdentity } from "@prisma/client";

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
        status?: PrismaAgentIdentity["status"];
        autonomyMode?: PrismaAgentIdentity["autonomyMode"];
        soulFile?: string;
        dailyLimitCents?: number;
      };
    },
    ctx: Context,
  ) => {
    const membership = await orgMemberService.assertMembership(ctx.userId, args.organizationId);
    if (membership.role !== "admin") {
      throw new Error("Only admins can update agent settings");
    }

    return agentIdentityService.update(args.organizationId, {
      ...(args.input.name != null && { name: args.input.name }),
      ...(args.input.status != null && { status: args.input.status }),
      ...(args.input.autonomyMode != null && { autonomyMode: args.input.autonomyMode }),
      ...(args.input.soulFile != null && { soulFile: args.input.soulFile }),
      ...(args.input.dailyLimitCents != null && { dailyLimitCents: args.input.dailyLimitCents }),
    });
  },
};

export const agentIdentityTypeResolvers = {
  AgentIdentity: {
    costBudget: (parent: PrismaAgentIdentity) => ({
      dailyLimitCents: parent.dailyLimitCents,
    }),
  },
};
