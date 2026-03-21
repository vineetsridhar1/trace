import type { Context } from "../context.js";
import { prisma } from "../lib/db.js";
import { agentIdentityService } from "../services/agent-identity.js";
import type { AgentIdentity as PrismaAgentIdentity } from "@prisma/client";

export const agentIdentityQueries = {
  agentIdentity: (_: unknown, args: { organizationId: string }, ctx: Context) => {
    if (args.organizationId !== ctx.organizationId) {
      throw new Error("Not authorized for this organization");
    }
    return prisma.agentIdentity.findUnique({
      where: { organizationId: args.organizationId },
    });
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
    if (args.organizationId !== ctx.organizationId) {
      throw new Error("Not authorized for this organization");
    }
    if (ctx.role !== "admin") {
      throw new Error("Only admins can update agent settings");
    }

    return prisma.agentIdentity.update({
      where: { organizationId: args.organizationId },
      data: {
        ...(args.input.name != null && { name: args.input.name }),
        ...(args.input.status != null && { status: args.input.status }),
        ...(args.input.autonomyMode != null && { autonomyMode: args.input.autonomyMode }),
        ...(args.input.soulFile != null && { soulFile: args.input.soulFile }),
        ...(args.input.dailyLimitCents != null && { dailyLimitCents: args.input.dailyLimitCents }),
      },
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
