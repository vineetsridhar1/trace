import type { Context } from "../context.js";
import type { CreateAgentEnvironmentInput, UpdateAgentEnvironmentInput } from "@trace/gql";
import { Prisma } from "@prisma/client";
import { agentEnvironmentService } from "../services/agent-environment.js";
import { assertOrgAccess, requireOrgContext } from "../lib/require-org.js";

function requiredConfig(value: CreateAgentEnvironmentInput["config"]): Prisma.InputJsonValue {
  if (value === null) throw new Error("Agent environment config is required");
  return value;
}

function optionalConfig(
  value: UpdateAgentEnvironmentInput["config"],
): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return value;
}

export const agentEnvironmentQueries = {
  agentEnvironments: (_: unknown, args: { orgId: string }, ctx: Context) => {
    assertOrgAccess(ctx, args.orgId);
    return agentEnvironmentService.list(args.orgId);
  },
};

export const agentEnvironmentMutations = {
  createAgentEnvironment: (
    _: unknown,
    args: { input: CreateAgentEnvironmentInput },
    ctx: Context,
  ) => {
    assertOrgAccess(ctx, args.input.orgId);
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
    const orgId = requireOrgContext(ctx);
    return agentEnvironmentService.update(
      args.input.id,
      orgId,
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
    const orgId = requireOrgContext(ctx);
    await agentEnvironmentService.delete(args.id, orgId, ctx.actorType, ctx.userId);
    return true;
  },

  testAgentEnvironment: (_: unknown, args: { id: string }, ctx: Context) => {
    const orgId = requireOrgContext(ctx);
    return agentEnvironmentService.test(args.id, orgId);
  },
};

export const agentEnvironmentTypeResolvers = {
  AgentEnvironment: {
    orgId: (environment: { organizationId: string }) => environment.organizationId,
  },
};
