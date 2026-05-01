import { Prisma, type BridgeAccessCapability, type BridgeAccessScopeType } from "@prisma/client";
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
  requestedCapabilities: BridgeAccessCapability[];
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
    capabilities: BridgeAccessCapability[];
    expiresAt: string | null;
    createdAt: string;
  } | null;
};

type BridgeGrantUpdatedEventPayload = {
  grantId: string;
  ownerUserId: string;
  granteeUserId: string;
  runtimeInstanceId: string;
  runtimeLabel: string;
  scopeType: BridgeAccessScopeType;
  sessionGroupId: string | null;
  sessionGroup: { id: string; name: string | null } | null;
  priorCapabilities: BridgeAccessCapability[];
  capabilities: BridgeAccessCapability[];
  updatedAt: string;
};

export type BridgeAccessApprovedHandlerInput = {
  organizationId: string;
  granteeUserId: string;
  runtimeInstanceId: string;
  scopeType: BridgeAccessScopeType;
  sessionGroupId: string | null;
};

type BridgeAccessApprovedHandler = (
  input: BridgeAccessApprovedHandlerInput,
) => Promise<void> | void;

let bridgeAccessApprovedHandler: BridgeAccessApprovedHandler | null = null;

export function setBridgeAccessApprovedHandler(handler: BridgeAccessApprovedHandler): void {
  bridgeAccessApprovedHandler = handler;
}

const OWNER_CAPABILITIES: BridgeAccessCapability[] = ["session", "terminal"];

/**
 * Dedupe and always include `session`. Used for both request and grant
 * capability normalization — a request without `session` is meaningless, and
 * a grant without it locks the grantee out of the sessions they were granted.
 */
function ensureSessionCapability(
  input?: BridgeAccessCapability[] | null,
): BridgeAccessCapability[] {
  const set = new Set<BridgeAccessCapability>(input ?? []);
  set.add("session");
  return Array.from(set);
}

function capabilitiesCover(
  granted: BridgeAccessCapability[] | null | undefined,
  requested: BridgeAccessCapability[],
): boolean {
  const grantedSet = new Set(granted ?? []);
  return requested.every((capability) => grantedSet.has(capability));
}

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
  capabilities: BridgeAccessCapability[];
  expiresAt: Date | null;
  pendingRequest: BridgeAccessRequestWithRelations | null;
};

function buildGrantScopeWhere(sessionGroupId?: string | null): Prisma.BridgeAccessGrantWhereInput {
  if (sessionGroupId) {
    return {
      OR: [{ scopeType: "all_sessions" }, { scopeType: "session_group", sessionGroupId }],
    };
  }

  return { scopeType: "all_sessions" };
}

function buildActiveGrantWhere(params: {
  granteeUserId: string;
  sessionGroupId?: string | null;
  capability?: BridgeAccessCapability;
  now?: Date;
}): Prisma.BridgeAccessGrantWhereInput {
  const now = params.now ?? new Date();
  const where: Prisma.BridgeAccessGrantWhereInput = {
    granteeUserId: params.granteeUserId,
    revokedAt: null,
    AND: [
      buildGrantScopeWhere(params.sessionGroupId),
      {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    ],
  };
  if (params.capability) {
    where.capabilities = { has: params.capability };
  }
  return where;
}

function isConnectedRuntime(instanceId: string, organizationId: string): boolean {
  return sessionRouter.isRuntimeAvailable(instanceId, organizationId);
}

function runtimeHostingMode(
  runtimeInstanceId: string,
  organizationId: string,
  persisted: { id: string } | null,
): "cloud" | "local" | null {
  const runtime = sessionRouter.getRuntime(runtimeInstanceId, organizationId);
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
    requestedCapabilities: request.requestedCapabilities ?? [],
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
          capabilities: grant.capabilities ?? [],
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
    const existing = await prisma.bridgeRuntime.findFirst({
      where: { instanceId: params.instanceId, organizationId: params.organizationId },
      select: {
        id: true,
        ownerUserId: true,
      },
    });

    if (existing && existing.ownerUserId !== params.ownerUserId) {
      throw new AuthorizationError(
        "This bridge instance is already registered to another user in this organization",
      );
    }

    const data = {
      organizationId: params.organizationId,
      ownerUserId: params.ownerUserId,
      label: params.label,
      hostingMode: params.hostingMode,
      connectedAt: new Date(),
      lastSeenAt: new Date(),
      disconnectedAt: null,
      metadata: params.metadata,
    };

    if (existing) {
      return prisma.bridgeRuntime.update({
        where: { id: existing.id },
        data,
        include: { ownerUser: true },
      });
    }

    try {
      return await prisma.bridgeRuntime.create({
        data: {
          instanceId: params.instanceId,
          ...data,
        },
        include: { ownerUser: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await prisma.bridgeRuntime.findFirst({
          where: { instanceId: params.instanceId, organizationId: params.organizationId },
          select: { id: true, ownerUserId: true },
        });
        if (!raced) throw error;
        if (raced.ownerUserId !== params.ownerUserId) {
          throw new AuthorizationError(
            "This bridge instance is already registered to another user in this organization",
          );
        }
        return prisma.bridgeRuntime.update({
          where: { id: raced.id },
          data,
          include: { ownerUser: true },
        });
      }
      throw error;
    }
  }

  async markRuntimeDisconnected(instanceId: string, organizationId?: string | null): Promise<void> {
    await prisma.bridgeRuntime.updateMany({
      where: { instanceId, ...(organizationId ? { organizationId } : {}) },
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

  /**
   * Resolve the caller's access state against a bridge runtime.
   *
   * If `capability` is passed, the grant lookup filters to grants carrying
   * that capability — `allowed` and the returned `capabilities` list reflect
   * *only* that narrowed view. This is the right shape for `assertAccess`
   * (which only checks `allowed`), but callers reading `capabilities` for
   * display should NOT pass `capability`, or they'll get an empty array even
   * when the caller has broader access via a session-only grant.
   */
  async getAccessState(input: {
    userId: string;
    organizationId: string;
    runtimeInstanceId: string;
    sessionGroupId?: string | null;
    capability?: BridgeAccessCapability;
  }): Promise<BridgeRuntimeAccessState> {
    // Scope the lookup to the caller's org. A cross-org runtime falls through
    // to the !persisted branch below, returning no identifying fields — never
    // leak label/ownerUser across tenants.
    const persisted = await prisma.bridgeRuntime.findFirst({
      where: { instanceId: input.runtimeInstanceId, organizationId: input.organizationId },
      include: {
        ownerUser: true,
        accessGrants: {
          where: buildActiveGrantWhere({
            granteeUserId: input.userId,
            sessionGroupId: input.sessionGroupId,
            capability: input.capability,
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

    const hostingMode = runtimeHostingMode(input.runtimeInstanceId, input.organizationId, persisted);
    const connected = isConnectedRuntime(input.runtimeInstanceId, input.organizationId);

    if (!persisted) {
      const allowed = hostingMode !== "local";
      // Never disclose a router-level label/ownership for a bridge that is
      // not registered in the caller's org — sessionRouter is cross-org
      // shared and would otherwise leak another tenant's bridge name.
      return {
        runtimeInstanceId: input.runtimeInstanceId,
        bridgeRuntimeId: null,
        label: null,
        hostingMode,
        connected,
        ownerUser: null,
        allowed,
        isOwner: allowed,
        scopeType: null,
        sessionGroupId: null,
        capabilities: allowed ? OWNER_CAPABILITIES : [],
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
        capabilities: OWNER_CAPABILITIES,
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
      capabilities: grant?.capabilities ?? [],
      expiresAt: grant?.expiresAt ?? null,
      pendingRequest: persisted.accessRequests[0] ?? null,
    };
  }

  async assertAccess(input: {
    userId: string;
    organizationId: string;
    runtimeInstanceId?: string | null;
    sessionGroupId?: string | null;
    capability?: BridgeAccessCapability;
  }): Promise<void> {
    if (!input.runtimeInstanceId) return;

    const access = await this.getAccessState({
      userId: input.userId,
      organizationId: input.organizationId,
      runtimeInstanceId: input.runtimeInstanceId,
      sessionGroupId: input.sessionGroupId,
      capability: input.capability,
    });

    if (access.hostingMode !== "local") return;
    if (access.allowed) return;

    throw new AuthorizationError(BRIDGE_ACCESS_DENIED_ERROR);
  }

  async listAccessibleRuntimeInstanceIds(input: {
    userId: string;
    organizationId: string;
    sessionGroupId?: string | null;
    capability?: BridgeAccessCapability;
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
                capability: input.capability,
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
    requestedCapabilities?: BridgeAccessCapability[] | null;
  }) {
    const normalizedCapabilities = ensureSessionCapability(input.requestedCapabilities);
    const runtime = await prisma.bridgeRuntime.findFirst({
      where: { instanceId: input.runtimeInstanceId, organizationId: input.organizationId },
      include: { ownerUser: true },
    });
    if (!runtime) {
      throw new Error("Bridge runtime not found");
    }
    if (runtime.ownerUserId === input.requesterUserId) {
      throw new Error("You already own this bridge");
    }
    if (input.requestedExpiresAt && input.requestedExpiresAt.getTime() <= Date.now()) {
      throw new Error("Requested expiration must be in the future");
    }

    const normalizedScopeType = input.scopeType;
    const normalizedSessionGroupId =
      normalizedScopeType === "session_group" ? (input.sessionGroupId ?? null) : null;
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
    if (activeGrant && capabilitiesCover(activeGrant.capabilities, normalizedCapabilities)) {
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
        if (
          exactMatch &&
          capabilitiesCover(
            ensureSessionCapability(exactMatch.requestedCapabilities),
            normalizedCapabilities,
          )
        ) {
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
            requestedCapabilities: normalizedCapabilities,
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
    capabilities?: BridgeAccessCapability[] | null;
  }) {
    const now = new Date();

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
      const expiresAt =
        input.expiresAt !== undefined ? input.expiresAt : request.requestedExpiresAt;

      // Secure default: when the owner doesn't specify capabilities, the grant
      // is session-only. Terminal requires an explicit opt-in from the owner
      // (via `input.capabilities`), regardless of what the requester asked for.
      const resolvedCapabilities = ensureSessionCapability(input.capabilities ?? []);

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
          capabilities: resolvedCapabilities,
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

      return {
        grant,
        runtimeInstanceId: request.bridgeRuntime.instanceId,
        granteeUserId: request.requesterUserId,
        scopeType,
        sessionGroupId,
      };
    });

    if (bridgeAccessApprovedHandler) {
      try {
        await bridgeAccessApprovedHandler({
          organizationId: input.organizationId,
          granteeUserId: result.granteeUserId,
          runtimeInstanceId: result.runtimeInstanceId,
          scopeType: result.scopeType,
          sessionGroupId: result.sessionGroupId,
        });
      } catch (error) {
        console.error("[runtime-access] failed to resume sessions after bridge approval", error);
      }
    }

    return result.grant;
  }

  async denyRequest(input: { requestId: string; organizationId: string; ownerUserId: string }) {
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

  async revokeGrant(input: { grantId: string; organizationId: string; ownerUserId: string }) {
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
            capabilities: updatedGrant.capabilities ?? [],
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

  async updateGrant(input: {
    grantId: string;
    organizationId: string;
    ownerUserId: string;
    capabilities: BridgeAccessCapability[];
  }) {
    const nextCapabilities = ensureSessionCapability(input.capabilities);

    const { updated, priorCapabilities } = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Read inside the tx so the revokedAt/authorization checks and the
        // update see a consistent snapshot — a concurrent revokeGrant between
        // read and write would otherwise produce an "update" event on an
        // already-revoked grant.
        const grant = await tx.bridgeAccessGrant.findUnique({
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
        if (grant.revokedAt) {
          throw new Error("Cannot update a revoked bridge access grant");
        }

        const prior = grant.capabilities ?? [];

        // Guarded write: updateMany with revokedAt:null as a predicate so a
        // race that revokes between read and write no-ops the update.
        const updateResult = await tx.bridgeAccessGrant.updateMany({
          where: { id: grant.id, revokedAt: null },
          data: { capabilities: nextCapabilities },
        });
        if (updateResult.count === 0) {
          throw new Error("Cannot update a revoked bridge access grant");
        }

        const updatedGrant = await tx.bridgeAccessGrant.findUniqueOrThrow({
          where: { id: grant.id },
          include: {
            granteeUser: true,
            grantedByUser: true,
            sessionGroup: true,
          },
        });

        const payload: BridgeGrantUpdatedEventPayload = {
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
          priorCapabilities: prior,
          capabilities: updatedGrant.capabilities ?? [],
          updatedAt: (updatedGrant.updatedAt ?? new Date()).toISOString(),
        };

        await eventService.create(
          {
            organizationId: input.organizationId,
            scopeType: "system",
            scopeId: input.organizationId,
            eventType: "bridge_access_updated",
            payload,
            actorType: "user",
            actorId: input.ownerUserId,
          },
          tx,
        );

        return { updated: updatedGrant, priorCapabilities: prior };
      },
    );

    // If terminal was removed, close the grantee's live PTYs. The
    // per-message gate in terminal-handler catches anything still in flight.
    const hadTerminal = priorCapabilities.includes("terminal");
    const hasTerminal = nextCapabilities.includes("terminal");
    if (hadTerminal && !hasTerminal) {
      await this.severGranteeTerminals({
        organizationId: input.organizationId,
        granteeUserId: updated.granteeUserId,
        scopeType: updated.scopeType,
        sessionGroupId: updated.sessionGroupId,
      });
    }

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

    terminalRelay.destroyTerminalsForUser(
      input.granteeUserId,
      scopedSessionIds,
      input.organizationId,
    );
  }
}

export const runtimeAccessService = new RuntimeAccessService();
