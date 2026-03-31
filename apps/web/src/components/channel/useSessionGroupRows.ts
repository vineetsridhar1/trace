import { useMemo } from "react";
import { useEntityStore } from "../../stores/entity";
import type { SessionGroupEntity } from "../../stores/entity";
import { getSessionGroupChannelId } from "../../lib/session-group";
import {
  getSessionGroupDisplayStatus,
  getSessionGroupAgentStatus,
} from "../session/sessionStatus";
import type { SessionGroupRow } from "./sessions-table-types";

export function useSessionGroupRows(
  channelId: string,
  options?: { archived?: boolean; status?: string },
): SessionGroupRow[] {
  const sessionGroups = useEntityStore((s) => s.sessionGroups);
  const sessions = useEntityStore((s) => s.sessions);
  const sessionIdsByGroup = useEntityStore((s) => s._sessionIdsByGroup);

  return useMemo(() => {
    const shouldIncludeArchived = options?.archived === true || options?.status === "archived";

    return (Object.values(sessionGroups) as SessionGroupEntity[])
      .map((group) => {
        const groupSessionIds = sessionIdsByGroup[group.id] ?? [];
        const groupSessions = groupSessionIds
          .map((id) => sessions[id])
          .filter(Boolean)
          .sort((a, b) => {
            const aSort = a._sortTimestamp ?? a.updatedAt ?? a.createdAt;
            const bSort = b._sortTimestamp ?? b.updatedAt ?? b.createdAt;
            const diff = new Date(bSort).getTime() - new Date(aSort).getTime();
            if (diff !== 0) return diff;
            return a.id.localeCompare(b.id);
          });

        const latestSession = groupSessions[0];
        const createdBySession = [...groupSessions].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )[0];
        const agentStatuses = groupSessions.map((session) => session.agentStatus);
        const sessionStatuses = groupSessions.map((session) => session.sessionStatus);
        const prUrl = group.prUrl as string | null | undefined;
        const archivedAt = group.archivedAt as string | null | undefined;
        const displaySessionStatus =
          groupSessions.length > 0
            ? getSessionGroupDisplayStatus(sessionStatuses, agentStatuses, prUrl, archivedAt)
            : ((group.status as string | undefined) ?? "in_progress");
        const displayAgentStatus = archivedAt
          ? "stopped"
          : getSessionGroupAgentStatus(agentStatuses);

        return {
          group,
          groupSessions,
          row: {
            ...group,
            latestSession,
            createdBySession,
            displaySessionStatus,
            displayAgentStatus,
            _sessionCount: groupSessions.length,
            _lastMessageAt:
              latestSession?._lastMessageAt
              ?? latestSession?._sortTimestamp
              ?? latestSession?.updatedAt
              ?? group.updatedAt,
            _sortTimestamp:
              latestSession?._sortTimestamp
              ?? latestSession?._lastMessageAt
              ?? latestSession?.updatedAt
              ?? group._sortTimestamp
              ?? group.updatedAt,
          } as SessionGroupRow,
        };
      })
      .filter(({ group, groupSessions, row }) => {
        if (getSessionGroupChannelId(group, groupSessions) !== channelId) {
          return false;
        }

        if (shouldIncludeArchived) {
          if (!group.archivedAt) return false;
        } else if (group.archivedAt) {
          return false;
        }

        if (options?.status) {
          return row.displaySessionStatus === options.status;
        }

        return row.displaySessionStatus !== "merged";
      })
      .map(({ row }) => row)
      .sort((a, b) => {
        const aSort = a._sortTimestamp ?? a.updatedAt ?? a.createdAt;
        const bSort = b._sortTimestamp ?? b.updatedAt ?? b.createdAt;
        const diff = new Date(bSort).getTime() - new Date(aSort).getTime();
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });
  }, [channelId, options?.archived, options?.status, sessionGroups, sessions, sessionIdsByGroup]);
}
