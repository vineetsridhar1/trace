import { Prisma, type BridgeAccessScopeType } from "@prisma/client";
import { isCloudMachineRuntimeId } from "@trace/shared";
import { prisma } from "../lib/db.js";
import { AuthorizationError } from "../lib/errors.js";
import { sessionRouter } from "../lib/session-router.js";
import { terminalRelay } from "../lib/terminal-relay.js";
import { eventService } from "./event.js";

const BRIDGE_ACCESS_DENIED_ERROR =
  "Access denied: you do not have permission to use this local bridge";

type BridgeRuntimeWithOwner = Prisma.BridgeRuntimeGetPayload<{
  include: { ownerUser: true };
}>;

type BridgeAccessGrantWithRelations = Prisma.BridgeAccessGrantGetPayload<{
  include: {
    granteeUser: true;
    grantedByUser: true;
    sessionGroup: true;
  };
}>;

type BridgeAccessRequestWithRelations = Prisma.BridgeAccessRequestGetPayload<{
  include: {
    requesterUser: true;
    ownerUser: true;
    resolvedByUser: true;
    sessionGroup: true;
  };
}>;

type BridgeAccessRequestEventRecord = Prisma.BridgeAccessRequestGetPayload<{
  include: {
    bridgeRuntime: true;
    requesterUser: true;
    ownerUser: true;
    resolvedByUser: true;
    sessionGroup: true;
  };
}>;

type BridgeRequestEventPayload = {
  ownerUserId: string;
  requestId: string;
  runtimeInstanceId: string;
  runtimeLabel: string;
  scopeType: BridgeAccessScopeType;
  sessionGroup: { id: string; name: string | null } | null;
  requestedExpiresAt: string | null;
  createdAt: string;
  status: "pending" | "approved" | "denied";
  requesterUser: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  };
  grant: {
    id: string;
    scopeType: BridgeAccessScopeType;
    sessionGroupId: string | null;
    expiresAt: string | null;
    createdAt: string;
  } | null;
};

export type BridgeRuntimeAccessState = {
  runtimeInstanceId: string;
  bridgeRuntimeId: string | null;
  label: string | null;
  hostingMode: "cloud" | "local" | null;
  connected: boolean;
  ownerUser: BridgeRuntimeWithOwner["ownerUser"] | null;
  allowed: boolean;
  isOwner: boolean;
  scopeType: BridgeAccessScopeType | null;
  sessionGroupId: string | null;
  expiresAt: Date | null;
  pendingRequest: BridgeAccessRequestWithRelations | null;
};

function buildGrantScopeWhere(
  sessionGroupId?: string | null,
): Prisma.BridgeAccessGrantWhereInput {
  if (sessionGroupId) {
    return {
      OR: [
        { scopeType: "all_sessions" },
        { scopeType: "session_group", sessionGroupId },
      ],
    };
  }

  return { scopeType: "all_sessions" };
}

function buildActiveGrantWhere(params: {
  granteeUserId: string;
  sessionGroupId?: string | null;
  now?: Date;
}): Prisma.BridgeAccessGrantWhereInput {
  const now = params.now ?? new Date();
  return {
    granteeUserId: params.granteeUserId,
    revokedAt: null,
    AND: [
      buildGrantScopeWhere(params.sessionGroupId),
      {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    ],
  };
}

function isConnectedRuntime(instanceId: string): boolean {
  return sessionRouter.isRuntimeAvailable(instanceId);
}

function runtimeHostingMode(
  runtimeInstanceId: string,
  persisted: { id: string } | null,
): "cloud" | "local" | null {
  const runtime = sessionRouter.getRuntime(runtimeInstanceId);
  if (runtime) return runtime.hostingMode;
  if (persisted) return "local";
  if (isCloudMachineRuntimeId(runtimeInstanceId)) return "cloud";
  return null;
}

function serializeBridgeAccessEventPayload(input: {
  request: BridgeAccessRequestEventRecord;
  status?: "pending" | "approved" | "denied";
  grant?: BridgeAccessGrantWithRelations | null;
}): BridgeRequestEventPayload {
  const { request, grant } = input;
  return {
    ownerUserId: request.ownerUserId,
    requestId: request.id,
    runtimeInstanceId: request.bridgeRuntime.instanceId,
    runtimeLabel: request.bridgeRuntime.label,
    scopeType: request.scopeType,
    sessionGroup: request.sessionGroup
      ? {
          id: request.sessionGroup.id,
          name: request.sessionGroup.name ?? null,
        }
      : null,
    requestedExpiresAt: request.requestedExpiresAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    status: input.status ?? request.status,
    requesterUser: {
      id: request.requesterUser.id,
      name: request.requesterUser.name ?? null,
      avatarUrl: request.requesterUser.avatarUrl ?? null,
    },
    grant: grant
      ? {
          id: grant.id,
          scopeType: grant.scopeType,
          sessionGroupId: grant.sessionGroupId ?? null,
          expiresAt: grant.expiresAt?.toISOString() ?? null,
          createdAt: grant.createdAt.toISOString(),
        }
      : null,
  };
}

class RuntimeAccessService {
  async registerLocalRuntimeConnection(params: {
    instanceId: string;
    organizationId: string;
    ownerUserId: string;
    label: string;
    hostingMode: "local";
    metadata?: Prisma.InputJsonValue;
  }) {
    const existing = await prisma.bridgeRuntime.findUnique({
      where: { instanceId: params.instanceId },
      select: {
        id: true,
        organizationId: true,
        ownerUserId: true,
      },
    });

    if (
      existing &&
      (existing.organizationId !== params.organizationId ||
        existing.ownerUserId !== params.ownerUserId)
    ) {
      throw new AuthorizationError(
        "This bridge instance is already registered to another user or organization",
      );
    }

    return prisma.bridgeRuntime.upsert({
      where: { instanceId: params.instanceId },
      create: {
        instanceId: params.instanceId,
        organizationId: params.organizationId,
        ownerUserId: params.ownerUserId,
        label: params.label,
        hostingMode: params.hostingMode,
        connectedAt: new Date(),
        lastSeenAt: new Date(),
        disconnectedAt: null,
        metadata: params.metadata,
      },
      update: {
        organizationId: params.organizationId,
        ownerUserId: params.ownerUserId,
        label: params.label,
        hostingMode: params.hostingMode,
        connectedAt: new Date(),
        lastSeenAt: new Date(),
        disconnectedAt: null,
        metadata: params.metadata,
      },
      include: { ownerUser: true },
    });
  }

  async markRuntimeDisconnected(instanceId: string): Promise<void> {
    await prisma.bridgeRuntime.updateMany({
      where: { instanceId },
      data: {
        disconnectedAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
  }

  async getBridgeRuntimeById(id: string) {
    return prisma.bridgeRuntime.findUnique({
      where: { id },
      include: { ownerUser: true },
    });
  }

  async getAccessState(input: {
    userId: string;
    organizationId: string;
    runtimeInstanceId: string;
    sessionGroupId?: string | null;
  }): Promise<BridgeRuntimeAccessState> {
    const persisted = await prisma.bridgeRuntime.findUnique({
      where: { instanceId: input.runtimeInstanceId },
      include: {
        ownerUser: true,
        accessGrants: {
          where: buildActiveGrantWhere({
            granteeUserId: input.userId,
            sessionGroupId: input.sessionGroupId,
          }),
          orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
          take: 1,
          include: {
            granteeUser: true,
            grantedByUser: true,
            sessionGroup: true,
          },
        },
        accessRequests: {
          where: {
            requesterUserId: input.userId,
            status: "pending",
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            requesterUser: true,
            ownerUser: true,
            resolvedByUser: true,
            sessionGroup: true,
          },
        },
      },
    });

    const hostingMode = runtimeHostingMode(input.runtimeInstanceId, persisted);
    const connected = isConnectedRuntime(input.runtimeInstanceId);

    if (!persisted) {
      const allowed = hostingMode !== "local";
      return {
        runtimeInstanceId: input.runtimeInstanceId,
        bridgeRuntimeId: null,
        label: sessionRouter.getRuntime(input.runtimeInstanceId)?.label ?? null,
        hostingMode,
        connected,
        ownerUser: null,
        allowed,
        isOwner: allowed,
        scopeType: null,
        sessionGroupId: null,
        expiresAt: null,
        pendingRequest: null,
      };
    }

    if (persisted.organizationId !== input.organizationId) {
      return {
        runtimeInstanceId: input.runtimeInstanceId,
        bridgeRuntimeId: persisted.id,
        label: persisted.label,
        hostingMode: "local",
        connected,
        ownerUser: persisted.ownerUser,
        allowed: false,
        isOwner: false,
        scopeType: null,
        sessionGroupId: null,
        expiresAt: null,
        pendingRequest: null,
      };
    }

    if (persisted.ownerUserId === input.userId) {
      return {
        runtimeInstanceId: input.runtimeInstanceId,
        bridgeRuntimeId: persisted.id,
        label: persisted.label,
        hostingMode: "local",
        connected,
        ownerUser: persisted.ownerUser,
        allowed: true,
        isOwner: true,
        scopeType: "all_sessions",
        sessionGroupId: null,
        expiresAt: null,
        pendingRequest: persisted.accessRequests[0] ?? null,
      };
    }

    const grant = persisted.accessGrants[0] ?? null;
    return {
      runtimeInstanceId: input.runtimeInstanceId,
      bridgeRuntimeId: persisted.id,
      label: persisted.label,
      hostingMode: "local",
      connected,
      ownerUser: persisted.ownerUser,
      allowed: !!grant,
      isOwner: false,
      scopeType: grant?.scopeType ?? null,
      sessionGroupId: grant?.sessionGroupId ?? null,
      expiresAt: grant?.expiresAt ?? null,
      pendingRequest: persisted.accessRequests[0] ?? null,
    };
  }

  async assertAccess(input: {
    userId: string;
    organizationId: string;
    runtimeInstanceId?: string | null;
    sessionGroupId?: string | null;
  }): Promise<void> {
    if (!input.runtimeInstanceId) return;

    const access = await this.getAccessState({
      userId: input.userId,
      organizationId: input.organizationId,
      runtimeInstanceId: input.runtimeInstanceId,
      sessionGroupId: input.sessionGroupId,
    });

    if (access.hostingMode !== "local") return;
    if (access.allowed) return;

    throw new AuthorizationError(BRIDGE_ACCESS_DENIED_ERROR);
  }

  async listAccessibleRuntimeInstanceIds(input: {
    userId: string;
    organizationId: string;
    sessionGroupId?: string | null;
  }): Promise<Set<string>> {
    const runtimes = await prisma.bridgeRuntime.findMany({
      where: {
        organizationId: input.organizationId,
        OR: [
          { ownerUserId: input.userId },
          {
            accessGrants: {
              some: buildActiveGrantWhere({
                granteeUserId: input.userId,
                sessionGroupId: input.sessionGroupId,
              }),
            },
          },
        ],
      },
      select: { instanceId: true },
    });

    return new Set(runtimes.map((runtime: { instanceId: string }) => runtime.instanceId));
  }

  async listOwnedBridgeRuntimes(ownerUserId: string, organizationId: string) {
    const now = new Date();
    return prisma.bridgeRuntime.findMany({
      where: { ownerUserId, organizationId },
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
  }

  async requestAccess(input: {
    requesterUserId: string;
    organizationId: string;
    runtimeInstanceId: string;
    scopeType: BridgeAccessScopeType;
    sessionGroupId?: string | null;
    requestedExpiresAt?: Date | null;
  }) {
    const runtime = await prisma.bridgeRuntime.findUnique({
      where: { instanceId: input.runtimeInstanceId },
      include: { ownerUser: true },
    });
    if (!runtime || runtime.organizationId !== input.organizationId) {
      throw new Error("Bridge runtime not found");
    }
    if (runtime.ownerUserId === input.requesterUserId) {
      throw new Error("You already own this bridge");
    }
    if (
      input.requestedExpiresAt &&
      input.requestedExpiresAt.getTime() <= Date.now()
    ) {
      throw new Error("Requested expiration must be in the future");
    }

    const normalizedScopeType = input.scopeType;
    const normalizedSessionGroupId =
      normalizedScopeType === "session_group" ? input.sessionGroupId ?? null : null;
    if (normalizedScopeType === "session_group" && !normalizedSessionGroupId) {
      throw new Error("sessionGroupId is required for session group bridge access");
    }
    if (normalizedSessionGroupId) {
      const sessionGroup = await prisma.sessionGroup.findFirst({
        where: { id: normalizedSessionGroupId, organizationId: input.organizationId },
        select: { id: true },
      });
      if (!sessionGroup) {
        throw new Error("Session group not found");
      }
    }

    const activeGrant = await prisma.bridgeAccessGrant.findFirst({
      where: {
        bridgeRuntimeId: runtime.id,
        ...buildActiveGrantWhere({
          granteeUserId: input.requesterUserId,
          sessionGroupId: normalizedSessionGroupId,
        }),
      },
      include: {
        granteeUser: true,
        grantedByUser: true,
        sessionGroup: true,
      },
    });
    if (activeGrant) {
      throw new Error("Bridge access has already been granted");
    }

    const attempt = async () =>
      prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const pendings = await tx.bridgeAccessRequest.findMany({
          where: {
            bridgeRuntimeId: runtime.id,
            requesterUserId: input.requesterUserId,
            status: "pending",
          },
          orderBy: { createdAt: "desc" },
          include: {
            bridgeRuntime: true,
            requesterUser: true,
            ownerUser: true,
            resolvedByUser: true,
            sessionGroup: true,
          },
        });

        const exactMatch = pendings.find(
          (p: BridgeAccessRequestEventRecord) =>
            p.scopeType === normalizedScopeType && p.sessionGroupId === normalizedSessionGroupId,
        );
        if (exactMatch) {
          return exactMatch;
        }

        const now = new Date();
        for (const prior of pendings) {
          await tx.bridgeAccessRequest.update({
            where: { id: prior.id },
            // Requester-initiated supersede, not a human denial — leave
            // resolvedByUserId null so audit reads clean.
            data: { status: "denied", resolvedAt: now, resolvedByUserId: null },
          });
          await eventService.create(
            {
              organizationId: input.organizationId,
              scopeType: "system",
              scopeId: input.organizationId,
              eventType: "bridge_access_request_resolved",
              payload: serializeBridgeAccessEventPayload({ request: prior, status: "denied" }),
              actorType: "user",
              actorId: input.requesterUserId,
            },
            tx,
          );
        }

        const newRequest = await tx.bridgeAccessRequest.create({
          data: {
            bridgeRuntimeId: runtime.id,
            requesterUserId: input.requesterUserId,
            ownerUserId: runtime.ownerUserId,
            scopeType: normalizedScopeType,
            sessionGroupId: normalizedSessionGroupId,
            requestedExpiresAt: input.requestedExpiresAt ?? null,
          },
          include: {
            bridgeRuntime: true,
            requesterUser: true,
            ownerUser: true,
            resolvedByUser: true,
            sessionGroup: true,
          },
        });

        await eventService.create(
          {
            organizationId: input.organizationId,
            scopeType: "system",
            scopeId: input.organizationId,
            eventType: "bridge_access_requested",
            payload: serializeBridgeAccessEventPayload({ request: newRequest }),
            actorType: "user",
            actorId: input.requesterUserId,
          },
          tx,
        );

        return newRequest;
      });

    // Retry once on P2002 — the partial unique index on (bridgeRuntimeId,
    // requesterUserId) WHERE status='pending' serializes concurrent requests
    // from the same user. The retry sees the winner's pending and falls
    // through the exact-match / supersede logic.
    try {
      return await attempt();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return await attempt();
      }
      throw error;
    }
  }

  async approveRequest(input: {
    requestId: string;
    organizationId: string;
    ownerUserId: string;
    scopeType?: BridgeAccessScopeType | null;
    sessionGroupId?: string | null;
    expiresAt?: Date | null;
  }) {
    const now = new Date();

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const request = await tx.bridgeAccessRequest.findUnique({
        where: { id: input.requestId },
        include: {
          bridgeRuntime: true,
          requesterUser: true,
          ownerUser: true,
          resolvedByUser: true,
          sessionGroup: true,
        },
      });
      if (!request || request.bridgeRuntime.organizationId !== input.organizationId) {
        throw new Error("Bridge access request not found");
      }
      if (request.ownerUserId !== input.ownerUserId) {
        throw new AuthorizationError(BRIDGE_ACCESS_DENIED_ERROR);
      }
      if (request.status !== "pending") {
        throw new Error("Bridge access request is no longer pending");
      }

      if (input.expiresAt && input.expiresAt.getTime() <= now.getTime()) {
        throw new Error("Bridge access expiration must be in the future");
      }

      const scopeType = input.scopeType ?? request.scopeType;
      const sessionGroupId =
        scopeType === "session_group"
          ? (input.sessionGroupId ?? request.sessionGroupId ?? null)
          : null;
      if (scopeType === "session_group" && !sessionGroupId) {
        throw new Error("sessionGroupId is required for session group bridge access");
      }
      if (sessionGroupId) {
        const sessionGroup = await tx.sessionGroup.findFirst({
          where: { id: sessionGroupId, organizationId: input.organizationId },
          select: { id: true },
        });
        if (!sessionGroup) {
          throw new Error("Session group not found");
        }
      }
      const expiresAt = input.expiresAt !== undefined ? input.expiresAt : request.requestedExpiresAt;

      await tx.bridgeAccessGrant.updateMany({
        where: {
          bridgeRuntimeId: request.bridgeRuntimeId,
          granteeUserId: request.requesterUserId,
          scopeType,
          sessionGroupId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });

      const grant = await tx.bridgeAccessGrant.create({
        data: {
          bridgeRuntimeId: request.bridgeRuntimeId,
          granteeUserId: request.requesterUserId,
          grantedByUserId: input.ownerUserId,
          scopeType,
          sessionGroupId,
          expiresAt,
        },
        include: {
          granteeUser: true,
          grantedByUser: true,
          sessionGroup: true,
        },
      });

      await tx.bridgeAccessRequest.update({
        where: { id: request.id },
        data: {
          status: "approved",
          resolvedAt: now,
          resolvedByUserId: input.ownerUserId,
        },
      });

      await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "system",
          scopeId: input.organizationId,
          eventType: "bridge_access_request_resolved",
          payload: serializeBridgeAccessEventPayload({
            request,
            status: "approved",
            grant,
          }),
          actorType: "user",
          actorId: input.ownerUserId,
        },
        tx,
      );

      return grant;
    });
  }

  async denyRequest(input: {
    requestId: string;
    organizationId: string;
    ownerUserId: string;
  }) {
    const request = await prisma.bridgeAccessRequest.findUnique({
      where: { id: input.requestId },
      include: {
        bridgeRuntime: true,
        requesterUser: true,
        ownerUser: true,
        resolvedByUser: true,
        sessionGroup: true,
      },
    });
    if (!request || request.bridgeRuntime.organizationId !== input.organizationId) {
      throw new Error("Bridge access request not found");
    }
    if (request.ownerUserId !== input.ownerUserId) {
      throw new AuthorizationError(BRIDGE_ACCESS_DENIED_ERROR);
    }
    if (request.status !== "pending") {
      throw new Error("Bridge access request is no longer pending");
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const denied = await tx.bridgeAccessRequest.update({
        where: { id: request.id },
        data: {
          status: "denied",
          resolvedAt: new Date(),
          resolvedByUserId: input.ownerUserId,
        },
        include: {
          bridgeRuntime: true,
          requesterUser: true,
          ownerUser: true,
          resolvedByUser: true,
          sessionGroup: true,
        },
      });

      await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "system",
          scopeId: input.organizationId,
          eventType: "bridge_access_request_resolved",
          payload: serializeBridgeAccessEventPayload({ request: denied, status: "denied" }),
          actorType: "user",
          actorId: input.ownerUserId,
        },
        tx,
      );

      return denied;
    });
  }

  async revokeGrant(input: {
    grantId: string;
    organizationId: string;
    ownerUserId: string;
  }) {
    const grant = await prisma.bridgeAccessGrant.findUnique({
      where: { id: input.grantId },
      include: {
        bridgeRuntime: true,
        granteeUser: true,
        grantedByUser: true,
        sessionGroup: true,
      },
    });
    if (!grant || grant.bridgeRuntime.organizationId !== input.organizationId) {
      throw new Error("Bridge access grant not found");
    }
    if (grant.bridgeRuntime.ownerUserId !== input.ownerUserId) {
      throw new AuthorizationError(BRIDGE_ACCESS_DENIED_ERROR);
    }
    if (grant.revokedAt) return grant;

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updatedGrant = await tx.bridgeAccessGrant.update({
        where: { id: grant.id },
        data: { revokedAt: new Date() },
        include: {
          granteeUser: true,
          grantedByUser: true,
          sessionGroup: true,
        },
      });

      await eventService.create(
        {
          organizationId: input.organizationId,
          scopeType: "system",
          scopeId: input.organizationId,
          eventType: "bridge_access_revoked",
          payload: {
            grantId: updatedGrant.id,
            ownerUserId: grant.bridgeRuntime.ownerUserId,
            granteeUserId: updatedGrant.granteeUserId,
            runtimeInstanceId: grant.bridgeRuntime.instanceId,
            runtimeLabel: grant.bridgeRuntime.label,
            scopeType: updatedGrant.scopeType,
            sessionGroupId: updatedGrant.sessionGroupId ?? null,
            sessionGroup: updatedGrant.sessionGroup
              ? { id: updatedGrant.sessionGroup.id, name: updatedGrant.sessionGroup.name ?? null }
              : null,
            revokedAt: updatedGrant.revokedAt?.toISOString() ?? new Date().toISOString(),
          },
          actorType: "user",
          actorId: input.ownerUserId,
        },
        tx,
      );

      return updatedGrant;
    });

    // Tear down terminals after commit — the relay state is in-memory, so
    // severing before the grant is durable could leave orphaned state if
    // the transaction rolls back.
    await this.severGranteeTerminals({
      organizationId: input.organizationId,
      granteeUserId: updated.granteeUserId,
      scopeType: updated.scopeType,
      sessionGroupId: updated.sessionGroupId,
    });

    return updated;
  }

  /**
   * Close every terminal the revoked grantee currently has open on the
   * bridge, closing their frontend WebSocket and tearing down the PTY.
   * For a `session_group` grant only terminals whose session is in that
   * group are affected; for `all_sessions` every in-org session is in
   * scope. Uses the terminal-relay attachment index so shared sessions
   * (terminals the grantee attached to on another user's session) are
   * caught, not just sessions the grantee created.
   */
  private async severGranteeTerminals(input: {
    organizationId: string;
    granteeUserId: string;
    scopeType: BridgeAccessScopeType;
    sessionGroupId: string | null;
  }): Promise<void> {
    let scopedSessionIds: Set<string> | undefined;
    if (input.scopeType === "session_group" && input.sessionGroupId) {
      const sessions = await prisma.session.findMany({
        where: {
          organizationId: input.organizationId,
          sessionGroupId: input.sessionGroupId,
        },
        select: { id: true },
      });
      scopedSessionIds = new Set(sessions.map((s: { id: string }) => s.id));
    } else {
      const sessions = await prisma.session.findMany({
        where: { organizationId: input.organizationId },
        select: { id: true },
      });
      scopedSessionIds = new Set(sessions.map((s: { id: string }) => s.id));
    }

    terminalRelay.destroyTerminalsForUser(input.granteeUserId, scopedSessionIds);
  }
}

export const runtimeAccessService = new RuntimeAccessService();
