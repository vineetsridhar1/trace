import { prisma } from "../lib/db.js";
import { agentIdentityService } from "../services/agent-identity.js";
import type { AgentIdentity as PrismaAgentIdentity } from "@prisma/client";

export const agentIdentityQueries = {
  agentIdentity: async (_: unknown, args: { organizationId: string }) => {
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
  ) => {
    const updates: Record<string, unknown> = {};
    if (args.input.name != null) updates.name = args.input.name;
    if (args.input.status != null) updates.status = args.input.status;
    if (args.input.autonomyMode != null) updates.autonomyMode = args.input.autonomyMode;
    if (args.input.soulFile != null) updates.soulFile = args.input.soulFile;
    if (args.input.dailyLimitCents != null) updates.dailyLimitCents = args.input.dailyLimitCents;

    await agentIdentityService.update(args.organizationId, updates);

    return prisma.agentIdentity.findUniqueOrThrow({
      where: { organizationId: args.organizationId },
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
