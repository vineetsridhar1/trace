import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { sessionRouter, type RuntimeInstance } from "../lib/session-router.js";
import type { BridgeLinkedCheckoutStatus } from "@trace/shared";

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
}

export interface ConnectionsBridge {
  bridge: BridgeWithAccess;
  repos: ConnectionsRepoEntry[];
  canTerminal: boolean;
}

class ConnectionsService {
  async listMine(input: { userId: string; organizationId: string }): Promise<ConnectionsBridge[]> {
    const now = new Date();
    const activeGrantWhere = {
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };

    const ownedBridges = await prisma.bridgeRuntime.findMany({
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
          where: activeGrantWhere,
          orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
          include: {
            granteeUser: true,
            grantedByUser: true,
            sessionGroup: true,
          },
        },
      },
    });

    const grantedBridges = await prisma.bridgeRuntime.findMany({
      where: {
        organizationId: input.organizationId,
        ownerUserId: { not: input.userId },
        accessGrants: {
          some: {
            granteeUserId: input.userId,
            ...activeGrantWhere,
          },
        },
      },
      orderBy: [{ connectedAt: "desc" }, { updatedAt: "desc" }],
      include: {
        ownerUser: true,
        accessRequests: {
          where: { requesterUserId: input.userId, status: "pending" },
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
            granteeUserId: input.userId,
            ...activeGrantWhere,
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

    const workBridges = [...ownedBridges, ...grantedBridges];
    const bridges =
      workBridges.length > 0
        ? workBridges
        : await prisma.bridgeRuntime.findMany({
            where: {
              organizationId: input.organizationId,
              ownerUserId: { not: input.userId },
            },
            orderBy: [{ connectedAt: "desc" }, { updatedAt: "desc" }],
            include: {
              ownerUser: true,
              accessRequests: {
                where: { requesterUserId: input.userId, status: "pending" },
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
                  granteeUserId: input.userId,
                  ...activeGrantWhere,
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
      if (!hasBridgeWorkAccess(bridge, input.userId)) continue;
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

    return bridges.map((bridge) => {
      const runtime = liveById.get(bridge.instanceId);
      const repos: ConnectionsRepoEntry[] = [];

      if (runtime && hasBridgeWorkAccess(bridge, input.userId)) {
        for (const repoId of runtime.registeredRepoIds) {
          const channel = channelByRepoId.get(repoId);
          if (!channel?.repo) continue;
          const checkout = runtime.linkedCheckouts.get(repoId) ?? null;
          repos.push({
            repo: channel.repo,
            channel,
            runScripts: channel.runScripts,
            linkedCheckout: checkout?.isAttached ? checkout : null,
          });
        }
      }

      return {
        bridge,
        repos,
        canTerminal:
          bridge.ownerUserId === input.userId ||
          bridge.accessGrants.some((grant) => grant.capabilities.includes("terminal")),
      };
    });
  }
}

function hasBridgeWorkAccess(bridge: BridgeWithAccess, userId: string): boolean {
  return bridge.ownerUserId === userId || bridge.accessGrants.length > 0;
}

export const connectionsService = new ConnectionsService();
