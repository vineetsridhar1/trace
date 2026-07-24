import type { CreateServiceAccessTokenInput, StartServiceSessionInput } from "@trace/gql";
import type { Context } from "../context.js";
import { AuthenticationError, toGraphQLError } from "../lib/errors.js";
import { requireOrgContext } from "../lib/require-org.js";
import { serviceAccessTokenService } from "../services/service-access-token.js";
import { sessionService } from "../services/session.js";

function requireServiceContext(ctx: Context): {
  organizationId: string;
  serviceAccessTokenId: string;
} {
  if (ctx.authKind !== "service" || !ctx.serviceAccessTokenId) {
    throw new AuthenticationError("Service token required");
  }
  return {
    organizationId: requireOrgContext(ctx),
    serviceAccessTokenId: ctx.serviceAccessTokenId,
  };
}

export const serviceAccessTokenQueries = {
  serviceAccessTokens: async (_: unknown, args: { organizationId: string }, ctx: Context) => {
    try {
      return await serviceAccessTokenService.list({
        organizationId: args.organizationId,
        actorType: ctx.actorType,
        actorId: ctx.userId,
      });
    } catch (error) {
      throw toGraphQLError(error);
    }
  },
  serviceSessionStatus: (_: unknown, args: { id: string }, ctx: Context) => {
    const service = requireServiceContext(ctx);
    return sessionService.getServiceStatus(args.id, service.organizationId);
  },
};

export const serviceAccessTokenMutations = {
  createServiceAccessToken: async (
    _: unknown,
    args: { input: CreateServiceAccessTokenInput },
    ctx: Context,
  ) => {
    try {
      return await serviceAccessTokenService.create({
        organizationId: args.input.organizationId,
        name: args.input.name,
        scopes: args.input.scopes,
        expiresAt: args.input.expiresAt,
        actorType: ctx.actorType,
        actorId: ctx.userId,
      });
    } catch (error) {
      throw toGraphQLError(error);
    }
  },
  revokeServiceAccessToken: async (_: unknown, args: { id: string }, ctx: Context) => {
    try {
      return await serviceAccessTokenService.revoke({
        id: args.id,
        organizationId: requireOrgContext(ctx),
        actorType: ctx.actorType,
        actorId: ctx.userId,
      });
    } catch (error) {
      throw toGraphQLError(error);
    }
  },
  startServiceSession: async (
    _: unknown,
    args: { input: StartServiceSessionInput },
    ctx: Context,
  ) => {
    const service = requireServiceContext(ctx);
    try {
      return await sessionService.startService({
        idempotencyKey: args.input.idempotencyKey,
        tool: args.input.tool,
        model: args.input.model,
        reasoningEffort: args.input.reasoningEffort,
        repoId: args.input.repoId,
        branch: args.input.branch,
        ticketId: args.input.ticketId,
        channelId: args.input.channelId,
        projectId: args.input.projectId,
        prompt: args.input.prompt,
        interactionMode: args.input.interactionMode,
        organizationId: service.organizationId,
        createdById: ctx.userId,
        serviceAccessTokenId: service.serviceAccessTokenId,
        clientSource: ctx.clientSource,
      });
    } catch (error) {
      throw toGraphQLError(error);
    }
  },
};
