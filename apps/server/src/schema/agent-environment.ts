import type { Context } from "../context.js";
import type { CreateAgentEnvironmentInput, UpdateAgentEnvironmentInput } from "@trace/gql";
import { Prisma } from "@prisma/client";
import { agentEnvironmentService } from "../services/agent-environment.js";

function requiredConfig(value: CreateAgentEnvironmentInput["config"]): Prisma.InputJsonValue {
  if (value === null) throw new Error("Agent environment config is required");
  return value;
}

function optionalConfig(
  value: UpdateAgentEnvironmentInput["config"],
): Prisma.InputJsonValue | undefined {
  if (value === null) throw new Error("Agent environment config cannot be null");
  if (value === undefined) return undefined;
  return value;
}

export const agentEnvironmentQueries = {
  agentEnvironments: (_: unknown, args: { orgId: string }, ctx: Context) => {
    return agentEnvironmentService.list(args.orgId, ctx.actorType, ctx.userId);
  },
};

export const agentEnvironmentMutations = {
  createAgentEnvironment: (
    _: unknown,
    args: { input: CreateAgentEnvironmentInput },
    ctx: Context,
  ) => {
    return agentEnvironmentService.create(
      {
        organizationId: args.input.orgId,
        name: args.input.name,
        adapterType: args.input.adapterType,
        config: requiredConfig(args.input.config),
        enabled: args.input.enabled ?? undefined,
        isDefault: args.input.isDefault ?? undefined,
      },
      ctx.actorType,
      ctx.userId,
    );
  },

  updateAgentEnvironment: (
    _: unknown,
    args: { input: UpdateAgentEnvironmentInput },
    ctx: Context,
  ) => {
    return agentEnvironmentService.update(
      args.input.id,
      {
        name: args.input.name ?? undefined,
        config: optionalConfig(args.input.config),
        enabled: args.input.enabled ?? undefined,
        isDefault: args.input.isDefault ?? undefined,
      },
      ctx.actorType,
      ctx.userId,
    );
  },

  deleteAgentEnvironment: async (_: unknown, args: { id: string }, ctx: Context) => {
    await agentEnvironmentService.delete(args.id, ctx.actorType, ctx.userId);
    return true;
  },

  testAgentEnvironment: (_: unknown, args: { id: string }, ctx: Context) => {
    return agentEnvironmentService.test(args.id, ctx.actorType, ctx.userId);
  },
};

export const agentEnvironmentTypeResolvers = {
  AgentEnvironment: {
    orgId: (environment: { organizationId: string }) => environment.organizationId,
  },
};
