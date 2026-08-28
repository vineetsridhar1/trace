import type { Context } from "../context.js";
import type { CreateIntegrationCredentialInput } from "@trace/gql";
import { assertOrgAccess, requireOrgContext } from "../lib/require-org.js";
import { integrationCredentialService } from "../services/integration-credential.js";

export const integrationCredentialQueries = {
  integrationCredentials: (_: unknown, args: { organizationId: string }, ctx: Context) => {
    assertOrgAccess(ctx, args.organizationId);
    return integrationCredentialService.list(args.organizationId, ctx.userId);
  },
};

export const integrationCredentialMutations = {
  createIntegrationCredential: (
    _: unknown,
    args: { input: CreateIntegrationCredentialInput },
    ctx: Context,
  ) => {
    assertOrgAccess(ctx, args.input.organizationId);
    return integrationCredentialService.create({
      organizationId: args.input.organizationId,
      name: args.input.name,
      allowedChannelIds: args.input.allowedChannelIds,
      expiresAt: args.input.expiresAt,
      actorId: ctx.userId,
    });
  },

  revokeIntegrationCredential: (_: unknown, args: { id: string }, ctx: Context) => {
    return integrationCredentialService.revoke(args.id, requireOrgContext(ctx), ctx.userId);
  },
};
