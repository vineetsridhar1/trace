import { useAuthStore } from "../stores/auth";
import { useEntityStore, type SessionEntity, type SessionGroupEntity } from "@trace/client-core";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function getLinkedCheckoutRuntimeInstanceId(connection: unknown): string | null {
  const record = asRecord(connection);
  const runtimeInstanceId = record?.runtimeInstanceId;
  return typeof runtimeInstanceId === "string" && runtimeInstanceId.trim()
    ? runtimeInstanceId
    : null;
}

export interface LinkedCheckoutGroupAccess {
  runtimeInstanceId: string | null;
  isConnected: boolean;
  ownsRuntime: boolean;
  allowed: boolean;
}

export function getLinkedCheckoutGroupAccess(
  sessionGroupId: string,
  currentUserId?: string | null | undefined,
): LinkedCheckoutGroupAccess {
  const resolvedUserId = currentUserId ?? useAuthStore.getState().user?.id ?? null;
  const entityState = useEntityStore.getState();
  const group = entityState.sessionGroups[sessionGroupId] as SessionGroupEntity | undefined;
  const groupConnection = asRecord(group?.connection);
  const runtimeInstanceId = getLinkedCheckoutRuntimeInstanceId(groupConnection);
  const isConnected = !!runtimeInstanceId && groupConnection?.state !== "disconnected";
  const sessionIds = entityState._sessionIdsByGroup[sessionGroupId] ?? [];

  const ownsRuntime =
    !!runtimeInstanceId &&
    !!resolvedUserId &&
    sessionIds.some((sessionId) => {
      const session = entityState.sessions[sessionId] as SessionEntity | undefined;
      if (!session || session.hosting !== "local") return false;
      if (getLinkedCheckoutRuntimeInstanceId(session.connection) !== runtimeInstanceId) {
        return false;
      }

      const createdBy = session.createdBy as { id?: string } | undefined;
      return createdBy?.id === resolvedUserId;
    });

  return {
    runtimeInstanceId,
    isConnected,
    ownsRuntime,
    allowed: isConnected && ownsRuntime,
  };
}
