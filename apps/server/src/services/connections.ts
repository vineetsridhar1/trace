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

class ConnectionsService {
  async listMine(input: { userId: string; organizationId: string }): Promise<ConnectionsBridge[]> {
    const now = new Date();
    const bridges = await prisma.bridgeRuntime.findMany({
      where: {
        organizationId: input.organizationId,
        ownerUserId: input.userId,
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

    const attachedSessionGroupIds = new Set<string>();
    for (const runtime of liveById.values()) {
      for (const checkout of runtime.linkedCheckouts.values()) {
        if (!checkout.isAttached || !checkout.attachedSessionGroupId) continue;
        attachedSessionGroupIds.add(checkout.attachedSessionGroupId);
      }
    }

    const attachedSessionGroups = attachedSessionGroupIds.size
      ? await prisma.sessionGroup.findMany({
          where: {
            organizationId: input.organizationId,
            id: { in: [...attachedSessionGroupIds] },
          },
          select: {
            id: true,
            name: true,
            slug: true,
            branch: true,
          },
        })
      : [];
    const attachedSessionGroupById = new Map(
      (attachedSessionGroups ?? []).map((group) => [group.id, group]),
    );

    return bridges.map((bridge) => {
      const runtime = liveById.get(bridge.instanceId);
      const repos: ConnectionsRepoEntry[] = [];

      if (runtime) {
        for (const repoId of runtime.registeredRepoIds) {
          const channel = channelByRepoId.get(repoId);
          if (!channel?.repo) continue;
          const checkout = runtime.linkedCheckouts.get(repoId) ?? null;
          repos.push({
            repo: channel.repo,
            channel,
            runScripts: channel.runScripts,
            linkedCheckout: checkout?.isAttached ? checkout : null,
            webPreview: webPreviewService.buildConnectionsRepoPreview({
              userId: input.userId,
              ownerUserId: bridge.ownerUserId,
              repo: channel.repo,
              sessionGroup:
                checkout?.attachedSessionGroupId
                  ? (attachedSessionGroupById.get(checkout.attachedSessionGroupId) ?? null)
                  : null,
              runtimeInstanceId: runtime.id,
              connected: !runtime.ws || runtime.ws.readyState === runtime.ws.OPEN,
              tunnelSlots: runtime.tunnelSlots ? [...runtime.tunnelSlots.values()] : [],
              attachedSessionGroupId: checkout?.attachedSessionGroupId ?? null,
            }),
          });
        }
      }

      return {
        bridge,
        repos,
        canTerminal: true,
      };
    });
  }
}

export const connectionsService = new ConnectionsService();
