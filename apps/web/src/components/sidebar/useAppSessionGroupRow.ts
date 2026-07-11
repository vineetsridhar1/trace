import { useMemo } from "react";
import { useEntityStore, type SessionEntity } from "@trace/client-core";
import { getSessionGroupAgentStatus, getSessionGroupDisplayStatus } from "../session/sessionStatus";
import type { SessionGroupRow } from "../channel/sessions-table-types";

/**
 * Build a minimal SessionGroupRow for an app session group so it can drive the
 * shared SessionStatusIndicator. App groups have no channel, so the channel-scoped
 * useSessionGroupRows never surfaces them — derive the display status here from the
 * group's member sessions in the store (subscribing to the stable raw tables and
 * deriving in useMemo to avoid a fresh-object selector looping the store).
 */
export function useAppSessionGroupRow(groupId: string): SessionGroupRow {
  const group = useEntityStore((s) => s.sessionGroups[groupId]);
  const sessionsTable = useEntityStore((s) => s.sessions);
  const idsByGroup = useEntityStore((s) => s._sessionIdsByGroup);

  return useMemo(() => {
    const groupSessions = (idsByGroup[groupId] ?? [])
      .map((id: string) => sessionsTable[id])
      .filter((session): session is SessionEntity => Boolean(session));
    const agentStatuses = groupSessions.map((session) => session.agentStatus);
    const sessionStatuses = groupSessions.map((session) => session.sessionStatus);
    const prUrl = group?.prUrl as string | null | undefined;
    const archivedAt = group?.archivedAt as string | null | undefined;

    const displaySessionStatus =
      groupSessions.length > 0
        ? getSessionGroupDisplayStatus(
            sessionStatuses,
            agentStatuses,
            prUrl,
            archivedAt,
            groupSessions,
          )
        : ((group?.status as string | undefined) ?? "in_progress");
    const displayAgentStatus = archivedAt
      ? "stopped"
      : groupSessions.length > 0
        ? getSessionGroupAgentStatus(agentStatuses, groupSessions)
        : "done";

    return {
      ...group,
      displaySessionStatus,
      displayAgentStatus,
      _sessionCount: groupSessions.length,
    } as SessionGroupRow;
  }, [group, groupId, sessionsTable, idsByGroup]);
}
