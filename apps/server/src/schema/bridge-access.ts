import type { Context } from "../context.js";
import { AuthenticationError } from "../lib/errors.js";
import { requireOrgContext } from "../lib/require-org.js";
import { sessionRouter } from "../lib/session-router.js";
import { runtimeAccessService } from "../services/runtime-access.js";

export const bridgeAccessQueries = {
  myBridgeRuntimes: (_: unknown, _args: unknown, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    return runtimeAccessService.listOwnedBridgeRuntimes(ctx.userId, requireOrgContext(ctx));
  },
  bridgeRuntimeAccess: (
    _: unknown,
    args: { runtimeInstanceId: string; sessionGroupId?: string | null },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return runtimeAccessService.getAccessState({
      userId: ctx.userId,
      organizationId: requireOrgContext(ctx),
      runtimeInstanceId: args.runtimeInstanceId,
      sessionGroupId: args.sessionGroupId ?? undefined,
    });
  },
};

export const bridgeAccessMutations = {
  requestBridgeAccess: (
    _: unknown,
    args: {
      runtimeInstanceId: string;
      scopeType: "all_sessions" | "session_group";
      sessionGroupId?: string | null;
      requestedExpiresAt?: string | null;
    },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return runtimeAccessService.requestAccess({
      requesterUserId: ctx.userId,
      organizationId: requireOrgContext(ctx),
      runtimeInstanceId: args.runtimeInstanceId,
      scopeType: args.scopeType,
      sessionGroupId: args.sessionGroupId ?? undefined,
      requestedExpiresAt: args.requestedExpiresAt ? new Date(args.requestedExpiresAt) : undefined,
    });
  },
  approveBridgeAccessRequest: (
    _: unknown,
    args: {
      requestId: string;
      scopeType?: "all_sessions" | "session_group" | null;
      sessionGroupId?: string | null;
      expiresAt?: string | null;
    },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return runtimeAccessService.approveRequest({
      requestId: args.requestId,
      organizationId: requireOrgContext(ctx),
      ownerUserId: ctx.userId,
      scopeType: args.scopeType ?? undefined,
      sessionGroupId: args.sessionGroupId ?? undefined,
      expiresAt:
        args.expiresAt === undefined ? undefined : args.expiresAt ? new Date(args.expiresAt) : null,
    });
  },
  denyBridgeAccessRequest: (_: unknown, args: { requestId: string }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    return runtimeAccessService.denyRequest({
      requestId: args.requestId,
      organizationId: requireOrgContext(ctx),
      ownerUserId: ctx.userId,
    });
  },
  revokeBridgeAccessGrant: (_: unknown, args: { grantId: string }, ctx: Context) => {
    if (!ctx.userId) throw new AuthenticationError();
    return runtimeAccessService.revokeGrant({
      grantId: args.grantId,
      organizationId: requireOrgContext(ctx),
      ownerUserId: ctx.userId,
    });
  },
};

export const bridgeAccessTypeResolvers = {
  BridgeRuntime: {
    connected: (runtime: { instanceId: string }) => sessionRouter.isRuntimeAvailable(runtime.instanceId),
  },
};
