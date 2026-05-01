import type { BridgeAccessCapability } from "@prisma/client";
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
      requestedCapabilities?: BridgeAccessCapability[] | null;
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
      requestedCapabilities: args.requestedCapabilities ?? undefined,
    });
  },
  approveBridgeAccessRequest: (
    _: unknown,
    args: {
      requestId: string;
      scopeType?: "all_sessions" | "session_group" | null;
      sessionGroupId?: string | null;
      expiresAt?: string | null;
      capabilities?: BridgeAccessCapability[] | null;
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
      capabilities: args.capabilities ?? undefined,
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
  updateBridgeAccessGrant: (
    _: unknown,
    args: { grantId: string; capabilities: BridgeAccessCapability[] },
    ctx: Context,
  ) => {
    if (!ctx.userId) throw new AuthenticationError();
    return runtimeAccessService.updateGrant({
      grantId: args.grantId,
      organizationId: requireOrgContext(ctx),
      ownerUserId: ctx.userId,
      capabilities: args.capabilities,
    });
  },
};

export const bridgeAccessTypeResolvers = {
  BridgeRuntime: {
    connected: (runtime: { instanceId: string; organizationId: string }) =>
      sessionRouter.isRuntimeAvailable(runtime.instanceId, runtime.organizationId),
    registeredRepoIds: (runtime: {
      instanceId: string;
      organizationId: string;
      metadata?: unknown;
    }) => {
      const live = sessionRouter.getRuntime(runtime.instanceId, runtime.organizationId);
      if (live) return live.registeredRepoIds;
      if (!runtime.metadata || typeof runtime.metadata !== "object" || Array.isArray(runtime.metadata)) {
        return [];
      }
      const registeredRepoIds = (runtime.metadata as Record<string, unknown>).registeredRepoIds;
      return Array.isArray(registeredRepoIds)
        ? registeredRepoIds.filter((repoId): repoId is string => typeof repoId === "string")
        : [];
    },
    linkedCheckouts: (runtime: { instanceId: string; organizationId: string }) => {
      const live = sessionRouter.getRuntime(runtime.instanceId, runtime.organizationId);
      if (!live || live.ws.readyState !== live.ws.OPEN) return [];
      // Filter by current registeredRepoIds so stale cache entries from
      // previously-linked-but-now-unlinked repos don't surface.
      const activeRepos = new Set(live.registeredRepoIds);
      return [...live.linkedCheckouts.values()].filter(
        (status) => status.isAttached && activeRepos.has(status.repoId),
      );
    },
  },
  LinkedCheckoutStatus: {
    // Batch via DataLoader so a polled `myBridgeRuntimes` with N checkouts
    // becomes a single `IN (…)` query per type, not N findUnique calls.
    // Org-scope post-load: every parent path is already owner-gated, but
    // filter here so a future entry point can't bypass it.
    attachedSessionGroup: async (
      status: { attachedSessionGroupId?: string | null },
      _args: unknown,
      ctx: Context,
    ) => {
      if (!status.attachedSessionGroupId || !ctx.organizationId) return null;
      const group = (await ctx.sessionGroupLoader.load(status.attachedSessionGroupId)) as {
        organizationId: string;
      } | null;
      if (!group || group.organizationId !== ctx.organizationId) return null;
      return group;
    },
    repo: async (status: { repoId: string }, _args: unknown, ctx: Context) => {
      if (!ctx.organizationId) return null;
      const repo = (await ctx.repoLoader.load(status.repoId)) as { organizationId: string } | null;
      if (!repo || repo.organizationId !== ctx.organizationId) return null;
      return repo;
    },
  },
};
