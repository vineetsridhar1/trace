import type { CreateNangoConnectSessionInput, UpsertAppIntegrationBindingInput } from "@trace/gql";
import type { Context } from "../context.js";
import { AuthenticationError } from "../lib/errors.js";
import { requireOrgContext } from "../lib/require-org.js";
import { appIntegrationService } from "../services/integration-services.js";

function requireUser(ctx: Context): string {
  if (!ctx.userId) throw new AuthenticationError();
  return ctx.userId;
}

export const appIntegrationQueries = {
  nangoIntegrationConfigured: () => appIntegrationService.nangoConfigured(),
  supportedAppIntegrations: (_parent: unknown, _args: unknown, ctx: Context) => {
    requireUser(ctx);
    return appIntegrationService.listSupportedIntegrations();
  },
  integrationConnections: (_parent: unknown, _args: unknown, ctx: Context) =>
    appIntegrationService.listConnections(requireOrgContext(ctx), requireUser(ctx), ctx.role),
  appIntegrationBindings: (_parent: unknown, args: { sessionGroupId: string }, ctx: Context) =>
    appIntegrationService.listBindings(
      args.sessionGroupId,
      requireOrgContext(ctx),
      requireUser(ctx),
    ),
};

export const appIntegrationMutations = {
  createNangoConnectSession: (
    _parent: unknown,
    args: { input: CreateNangoConnectSessionInput },
    ctx: Context,
  ) =>
    appIntegrationService.createConnectSession(
      requireOrgContext(ctx),
      requireUser(ctx),
      ctx.role,
      args.input,
    ),
  deleteIntegrationConnection: (_parent: unknown, args: { id: string }, ctx: Context) =>
    appIntegrationService.deleteConnection(
      requireOrgContext(ctx),
      requireUser(ctx),
      ctx.role,
      args.id,
    ),
  upsertAppIntegrationBinding: (
    _parent: unknown,
    args: { input: UpsertAppIntegrationBindingInput },
    ctx: Context,
  ) =>
    appIntegrationService.upsertBinding(
      requireOrgContext(ctx),
      requireUser(ctx),
      ctx.role,
      args.input,
    ),
  deleteAppIntegrationBinding: (
    _parent: unknown,
    args: { id: string; sessionGroupId?: string | null },
    ctx: Context,
  ) =>
    appIntegrationService.deleteBinding(
      requireOrgContext(ctx),
      requireUser(ctx),
      ctx.role,
      args.id,
      args.sessionGroupId,
    ),
};
