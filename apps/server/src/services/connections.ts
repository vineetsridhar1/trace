import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { sessionRouter, type RuntimeInstance } from "../lib/session-router.js";
import type { BridgeLinkedCheckoutStatus } from "@trace/shared";
import { webPreviewService, type WebPreviewRecord } from "./web-preview.js";

type BridgeWithAccess = Prisma.BridgeRuntimeGetPayload<{
  include: {
    ownerUser: true;
    accessRequests: {
      include: {
        requesterUser: true;
        ownerUser: true;
        resolvedByUser: true;
        sessionGroup: true;
      };
    };
    accessGrants: {
      include: {
        granteeUser: true;
        grantedByUser: true;
        sessionGroup: true;
      };
    };
  };
}>;

type VisibleChannel = Prisma.ChannelGetPayload<{ include: { repo: true } }>;

export interface ConnectionsRepoEntry {
  repo: NonNullable<VisibleChannel["repo"]>;
  channel: VisibleChannel;
  runScripts: Prisma.JsonValue | null;
  linkedCheckout: BridgeLinkedCheckoutStatus | null;
  webPreview: WebPreviewRecord;
}

export interface ConnectionsBridge {
  bridge: BridgeWithAccess;
  repos: ConnectionsRepoEntry[];
  canTerminal: boolean;
}

function activeGrantWhere(userId: string, now: Date): Prisma.BridgeAccessGrantWhereInput {
  return {
    granteeUserId: userId,
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

class ConnectionsService {
  async listMine(input: { userId: string; organizationId: string }): Promise<ConnectionsBridge[]> {
    const now = new Date();
    const bridges = await prisma.bridgeRuntime.findMany({
      where: {
        organizationId: input.organizationId,
        OR: [
          { ownerUserId: input.userId },
          { accessGrants: { some: activeGrantWhere(input.userId, now) } },
        ],
      },
      orderBy: [{ connectedAt: "desc" }, { updatedAt: "desc" }],
      include: {
        ownerUser: true,
        accessRequests: {
          where: { status: "pending" },
          orderBy: { createdAt: "asc" },
          include: {
            requesterUser: true,
            ownerUser: true,
            resolvedByUser: true,
            sessionGroup: true,
          },
        },
        accessGrants: {
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
          include: {
            granteeUser: true,
            grantedByUser: true,
            sessionGroup: true,
          },
        },
      },
    });

    const liveById = new Map<string, RuntimeInstance>();
    for (const runtime of sessionRouter.listRuntimes({})) {
      if (runtime.organizationId !== input.organizationId) continue;
      liveById.set(runtime.id, runtime);
    }

    const repoIds = new Set<string>();
    for (const bridge of bridges) {
      const runtime = liveById.get(bridge.instanceId);
      if (!runtime) continue;
      for (const repoId of runtime.registeredRepoIds) repoIds.add(repoId);
    }

    const visibleChannels = repoIds.size
      ? await prisma.channel.findMany({
          where: {
            organizationId: input.organizationId,
            type: "coding",
            repoId: { in: [...repoIds] },
            members: { some: { userId: input.userId } },
          },
          include: { repo: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        })
      : [];

    const channelByRepoId = new Map<string, VisibleChannel>();
    for (const channel of visibleChannels) {
      if (!channel.repoId || !channel.repo || channelByRepoId.has(channel.repoId)) continue;
      channelByRepoId.set(channel.repoId, channel);
    }

    const repoContexts: Array<{
      bridge: BridgeWithAccess;
      runtime: RuntimeInstance;
      repoId: string;
      channel: VisibleChannel;
    }> = [];
    for (const bridge of bridges) {
      const runtime = liveById.get(bridge.instanceId);
      if (!runtime) continue;
      for (const repoId of runtime.registeredRepoIds) {
        const channel = channelByRepoId.get(repoId);
        if (!channel?.repo) continue;
        repoContexts.push({
          bridge,
          runtime,
          repoId,
          channel,
        });
      }
    }

    const resolvedRepoContexts = await Promise.all(
      repoContexts.map(async (context) => {
        const cachedCheckout = context.runtime.linkedCheckouts.get(context.repoId) ?? null;
        const checkout =
          cachedCheckout ??
          (await webPreviewService.resolveLinkedCheckoutStatus({
            runtimeInstanceId: context.runtime.id,
            repoId: context.repoId,
          }));
        return {
          ...context,
          checkout,
        };
      }),
    );

    const attachedSessionGroupById = await webPreviewService.listVisibleSessionGroupsById({
      organizationId: input.organizationId,
      userId: input.userId,
      ids: resolvedRepoContexts.flatMap((context) =>
        context.checkout?.isAttached && context.checkout.attachedSessionGroupId
          ? [context.checkout.attachedSessionGroupId]
          : [],
      ),
    });

    const reposByBridgeId = new Map<string, ConnectionsRepoEntry[]>();
    for (const context of resolvedRepoContexts) {
      const repos = reposByBridgeId.get(context.bridge.instanceId) ?? [];
      const visibleAttachedSessionGroup =
        context.checkout?.attachedSessionGroupId != null
          ? (attachedSessionGroupById.get(context.checkout.attachedSessionGroupId) ?? null)
          : null;
      repos.push({
        repo: context.channel.repo!,
        channel: context.channel,
        runScripts: context.channel.runScripts,
        linkedCheckout:
          context.checkout?.isAttached &&
          (context.checkout.attachedSessionGroupId == null || visibleAttachedSessionGroup != null)
            ? context.checkout
            : null,
        webPreview: webPreviewService.buildConnectionsRepoPreview({
          userId: input.userId,
          ownerUserId: context.bridge.ownerUserId,
          repo: context.channel.repo,
          sessionGroup: visibleAttachedSessionGroup,
          runtimeInstanceId: context.runtime.id,
          connected: !context.runtime.ws || context.runtime.ws.readyState === context.runtime.ws.OPEN,
          tunnelSlots: context.runtime.tunnelSlots ? [...context.runtime.tunnelSlots.values()] : [],
          attachedSessionGroupId: context.checkout?.attachedSessionGroupId ?? null,
        }),
      });
      reposByBridgeId.set(context.bridge.instanceId, repos);
    }

    return bridges.map((bridge) => {
      const runtime = liveById.get(bridge.instanceId);
      const repos = runtime ? (reposByBridgeId.get(bridge.instanceId) ?? []) : [];

      // canTerminal: owner always has terminal; grantees need an all_sessions grant
      // with the terminal capability (channel terminals aren't session-group scoped).
      const canTerminal =
        bridge.ownerUserId === input.userId ||
        bridge.accessGrants.some(
          (g) =>
            g.granteeUserId === input.userId &&
            g.scopeType === "all_sessions" &&
            (g.capabilities as string[] | null ?? []).includes("terminal"),
        );

      return {
        bridge:
          bridge.ownerUserId === input.userId
            ? bridge
            : { ...bridge, accessRequests: [], accessGrants: [] },
        repos,
        canTerminal,
      };
    });
  }
}

export const connectionsService = new ConnectionsService();
