import { useMemo } from "react";
import { useEntityStore, useEntityIds } from "../../stores/entity";
import type { SessionEntity, SessionGroupEntity } from "../../stores/entity";
import { getSessionGroupChannelId } from "../../lib/session-group";
import {
  getSessionGroupDisplayStatus,
  getSessionGroupAgentStatus,
} from "../session/sessionStatus";
import type { SessionGroupRow } from "./sessions-table-types";

export function useSessionGroupRows(channelId: string): SessionGroupRow[] {
  const sessionGroups = useEntityStore((s) => s.sessionGroups);
  const sessions = useEntityStore((s) => s.sessions);
  const sessionIdsByGroup = useEntityStore((s) => s._sessionIdsByGroup);

  return useMemo(() => {
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
        return { group, groupSessions };
      })
      .filter(({ group, groupSessions }) => getSessionGroupChannelId(group, groupSessions) === channelId)
      .map(({ group, groupSessions }) => {
        const latestSession = groupSessions[0];
        const createdBySession = [...groupSessions].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )[0];
        const agentStatuses = groupSessions.map((session) => session.agentStatus);
        const sessionStatuses = groupSessions.map((session) => session.sessionStatus);
        const prUrl = group.prUrl as string | null | undefined;
        const displaySessionStatus =
          (group.status as string | undefined)
          ?? getSessionGroupDisplayStatus(sessionStatuses, agentStatuses, prUrl);
        const displayAgentStatus = getSessionGroupAgentStatus(agentStatuses);

        return {
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
        } as SessionGroupRow;
      })
      .sort((a, b) => {
        const aSort = a._sortTimestamp ?? a.updatedAt ?? a.createdAt;
        const bSort = b._sortTimestamp ?? b.updatedAt ?? b.createdAt;
        const diff = new Date(bSort).getTime() - new Date(aSort).getTime();
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      });
  }, [channelId, sessionGroups, sessions, sessionIdsByGroup]);
}
