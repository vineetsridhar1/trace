import { isCloudMachineRuntimeId, type BridgeTunnelSlot, type JsonObject } from "@trace/shared";
import { prisma } from "../lib/db.js";
import {
  readBridgeTunnelSlotsFromMetadata,
  selectBridgeTunnelSlot,
  serializeBridgeTunnelSlotsMetadata,
} from "../lib/bridge-tunnels.js";
import { sessionRouter } from "../lib/session-router.js";

export type WebPreviewReason =
  | "missing_repo"
  | "missing_repo_port"
  | "not_local_runtime"
  | "runtime_disconnected"
  | "not_synced_to_main_worktree"
  | "no_matching_tunnel"
  | "tunnel_inactive";

export interface WebPreviewRecord {
  available: boolean;
  reason: WebPreviewReason | null;
  url: string | null;
  port: number | null;
  runtimeInstanceId: string | null;
  slot: BridgeTunnelSlot | null;
  repo: {
    id: string;
    name: string;
    defaultBranch: string;
    webPreviewPort: number | null;
  } | null;
  sessionGroup: {
    id: string;
    name: string;
    slug?: string | null;
    branch?: string | null;
  } | null;
  isOwner: boolean;
  canManageTunnel: boolean;
}

interface BuildWebPreviewInput {
  repo: WebPreviewRecord["repo"];
  sessionGroup: WebPreviewRecord["sessionGroup"];
  runtimeInstanceId: string | null;
  isLocalRuntime: boolean;
  connected: boolean;
  tunnelSlots: BridgeTunnelSlot[];
  attachedSessionGroupId: string | null;
  isOwner: boolean;
}

function isSlotActive(slot: BridgeTunnelSlot): boolean {
  if (slot.mode === "manual") {
    return slot.state === "configured" || slot.state === "running";
  }
  return slot.state === "running";
}

export function buildWebPreview(input: BuildWebPreviewInput): WebPreviewRecord {
  const port = input.repo?.webPreviewPort ?? null;
  const slot =
    typeof port === "number" ? selectBridgeTunnelSlot(input.tunnelSlots, port) : null;
  const base: WebPreviewRecord = {
    available: false,
    reason: null,
    url: slot?.publicUrl ?? null,
    port,
    runtimeInstanceId: input.runtimeInstanceId,
    slot,
    repo: input.repo,
    sessionGroup: input.sessionGroup,
    isOwner: input.isOwner,
    canManageTunnel: input.isOwner && input.isLocalRuntime && input.connected,
  };

  if (!input.repo) {
    return { ...base, reason: "missing_repo" };
  }
  if (port == null) {
    return { ...base, reason: "missing_repo_port" };
  }
  if (!input.runtimeInstanceId || !input.isLocalRuntime) {
    return { ...base, reason: "not_local_runtime" };
  }
  if (!input.connected) {
    return { ...base, reason: "runtime_disconnected" };
  }
  if (!input.sessionGroup || input.attachedSessionGroupId !== input.sessionGroup.id) {
    return { ...base, reason: "not_synced_to_main_worktree" };
  }
  if (!slot) {
    return { ...base, reason: "no_matching_tunnel" };
  }
  if (!isSlotActive(slot)) {
    return { ...base, reason: "tunnel_inactive" };
  }

  return {
    ...base,
    available: true,
    reason: null,
    url: slot.publicUrl,
  };
}

function getRuntimeInstanceId(connection: unknown): string | null {
  if (!connection || typeof connection !== "object" || Array.isArray(connection)) return null;
  const runtimeInstanceId = (connection as { runtimeInstanceId?: unknown }).runtimeInstanceId;
  return typeof runtimeInstanceId === "string" && runtimeInstanceId.trim()
    ? runtimeInstanceId
    : null;
}

function getLiveTunnelSlots(runtimeInstanceId: string | null): BridgeTunnelSlot[] {
  if (!runtimeInstanceId) return [];
  const runtime = sessionRouter.getRuntime(runtimeInstanceId);
  if (!runtime) return [];
  return [...runtime.tunnelSlots.values()];
}

function isLocalRuntime(runtimeInstanceId: string | null): boolean {
  return !!runtimeInstanceId && !isCloudMachineRuntimeId(runtimeInstanceId);
}

async function getAttachedSessionGroupId(
  runtimeInstanceId: string | null,
  repoId: string | null,
): Promise<string | null> {
  if (!runtimeInstanceId || !repoId) return null;
  const runtime = sessionRouter.getRuntime(runtimeInstanceId);
  const cached = runtime?.linkedCheckouts.get(repoId) ?? null;
  if (cached) return cached.attachedSessionGroupId ?? null;
  if (!runtime || runtime.ws.readyState !== runtime.ws.OPEN) return null;
  try {
    const status = await sessionRouter.getLinkedCheckoutStatus(runtimeInstanceId, repoId, 5_000);
    return status.attachedSessionGroupId ?? null;
  } catch {
    return null;
  }
}

class WebPreviewService {
  async getSessionGroupPreview(input: {
    sessionGroupId: string;
    organizationId: string;
    userId: string;
  }): Promise<WebPreviewRecord> {
    const group = await prisma.sessionGroup.findFirst({
      where: {
        id: input.sessionGroupId,
        organizationId: input.organizationId,
        OR: [
          { channelId: null },
          { channel: { members: { some: { userId: input.userId, leftAt: null } } } },
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
        branch: true,
        connection: true,
        repo: {
          select: {
            id: true,
            name: true,
            defaultBranch: true,
            webPreviewPort: true,
          },
        },
      },
    });

    if (!group) throw new Error("Session group not found");

    const runtimeInstanceId = getRuntimeInstanceId(group.connection);
    const persistedRuntime = runtimeInstanceId
      ? await prisma.bridgeRuntime.findFirst({
          where: {
            instanceId: runtimeInstanceId,
            organizationId: input.organizationId,
          },
          select: {
            ownerUserId: true,
            metadata: true,
          },
        })
      : null;
    const liveRuntime = runtimeInstanceId ? sessionRouter.getRuntime(runtimeInstanceId) : null;
    const tunnelSlots = liveRuntime
      ? getLiveTunnelSlots(runtimeInstanceId)
      : readBridgeTunnelSlotsFromMetadata(persistedRuntime?.metadata);
    const attachedSessionGroupId = await getAttachedSessionGroupId(
      runtimeInstanceId,
      group.repo?.id ?? null,
    );

    return buildWebPreview({
      repo: group.repo,
      sessionGroup: {
        id: group.id,
        name: group.name,
        slug: group.slug,
        branch: group.branch,
      },
      runtimeInstanceId,
      isLocalRuntime: isLocalRuntime(runtimeInstanceId),
      connected: !!liveRuntime && liveRuntime.ws.readyState === liveRuntime.ws.OPEN,
      tunnelSlots,
      attachedSessionGroupId,
      isOwner:
        (persistedRuntime?.ownerUserId ?? liveRuntime?.ownerUserId ?? null) === input.userId,
    });
  }

  buildConnectionsRepoPreview(input: {
    userId: string;
    ownerUserId: string;
    repo: {
      id: string;
      name: string;
      defaultBranch: string;
      webPreviewPort: number | null;
    } | null;
    sessionGroup: {
      id: string;
      name: string;
      slug?: string | null;
      branch?: string | null;
    } | null;
    runtimeInstanceId: string | null;
    connected: boolean;
    tunnelSlots: BridgeTunnelSlot[];
    attachedSessionGroupId: string | null;
  }): WebPreviewRecord {
    return buildWebPreview({
      repo: input.repo,
      sessionGroup: input.sessionGroup,
      runtimeInstanceId: input.runtimeInstanceId,
      isLocalRuntime: isLocalRuntime(input.runtimeInstanceId),
      connected: input.connected,
      tunnelSlots: input.tunnelSlots,
      attachedSessionGroupId: input.attachedSessionGroupId,
      isOwner: input.ownerUserId === input.userId,
    });
  }

  serializeTunnelSlotsMetadata(tunnelSlots: BridgeTunnelSlot[]): JsonObject {
    return serializeBridgeTunnelSlotsMetadata(tunnelSlots);
  }
}

export const webPreviewService = new WebPreviewService();
