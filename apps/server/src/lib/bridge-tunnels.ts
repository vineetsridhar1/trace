import { Prisma } from "@prisma/client";
import { asJsonObject, type BridgeTunnelSlot, type JsonObject } from "@trace/shared";

function parseBridgeTunnelSlot(raw: unknown): BridgeTunnelSlot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const slot = raw as Record<string, unknown>;
  if (
    typeof slot.id !== "string" ||
    typeof slot.label !== "string" ||
    typeof slot.publicUrl !== "string" ||
    (slot.provider !== "custom" && slot.provider !== "ngrok") ||
    (slot.mode !== "manual" && slot.mode !== "trace_managed") ||
    (slot.state !== "configured" &&
      slot.state !== "running" &&
      slot.state !== "stopped" &&
      slot.state !== "error") ||
    typeof slot.updatedAt !== "string"
  ) {
    return null;
  }

  const targetPort =
    typeof slot.targetPort === "number" &&
    Number.isInteger(slot.targetPort) &&
    slot.targetPort >= 1 &&
    slot.targetPort <= 65535
      ? slot.targetPort
      : null;

  return {
    id: slot.id,
    label: slot.label,
    provider: slot.provider,
    mode: slot.mode,
    publicUrl: slot.publicUrl,
    targetPort,
    state: slot.state,
    lastError: typeof slot.lastError === "string" ? slot.lastError : null,
    updatedAt: slot.updatedAt,
  };
}

export function readBridgeTunnelSlotsFromMetadata(metadata: unknown): BridgeTunnelSlot[] {
  const object = asJsonObject(metadata);
  const rawSlots = object?.tunnelSlots;
  if (!Array.isArray(rawSlots)) return [];
  return rawSlots
    .map((slot) => parseBridgeTunnelSlot(slot))
    .filter((slot): slot is BridgeTunnelSlot => slot !== null);
}

function tunnelStateRank(state: BridgeTunnelSlot["state"]): number {
  switch (state) {
    case "running":
      return 0;
    case "configured":
      return 1;
    case "stopped":
      return 2;
    case "error":
    default:
      return 3;
  }
}

function tunnelModeRank(mode: BridgeTunnelSlot["mode"]): number {
  return mode === "trace_managed" ? 0 : 1;
}

function serializeBridgeTunnelSlot(slot: BridgeTunnelSlot): JsonObject {
  return {
    id: slot.id,
    label: slot.label,
    provider: slot.provider,
    mode: slot.mode,
    publicUrl: slot.publicUrl,
    targetPort: slot.targetPort,
    state: slot.state,
    lastError: slot.lastError,
    updatedAt: slot.updatedAt,
  } satisfies JsonObject;
}

export function serializeBridgeTunnelSlotsMetadata(tunnelSlots: BridgeTunnelSlot[]): JsonObject {
  return {
    tunnelSlots: tunnelSlots.map((slot) => serializeBridgeTunnelSlot(slot)),
  } satisfies JsonObject;
}

export function serializeBridgeTunnelSlotsForPrisma(
  tunnelSlots: BridgeTunnelSlot[],
): Prisma.InputJsonArray {
  return tunnelSlots.map(
    (slot) =>
      ({
        id: slot.id,
        label: slot.label,
        provider: slot.provider,
        mode: slot.mode,
        publicUrl: slot.publicUrl,
        targetPort: slot.targetPort,
        state: slot.state,
        lastError: slot.lastError,
        updatedAt: slot.updatedAt,
      }) satisfies Prisma.InputJsonObject,
  );
}

export function selectBridgeTunnelSlot(
  slots: BridgeTunnelSlot[],
  targetPort: number,
): BridgeTunnelSlot | null {
  const matching = slots.filter((slot) => slot.targetPort === targetPort);
  if (matching.length === 0) return null;

  const ordered = matching.slice().sort((a, b) => {
    const stateDiff = tunnelStateRank(a.state) - tunnelStateRank(b.state);
    if (stateDiff !== 0) return stateDiff;
    const modeDiff = tunnelModeRank(a.mode) - tunnelModeRank(b.mode);
    if (modeDiff !== 0) return modeDiff;
    const labelDiff = a.label.localeCompare(b.label);
    if (labelDiff !== 0) return labelDiff;
    return a.id.localeCompare(b.id);
  });

  return ordered[0] ?? null;
}
