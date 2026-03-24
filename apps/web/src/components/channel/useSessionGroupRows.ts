import { useMemo } from "react";
import { useEntityStore } from "../../stores/entity";
import type { SessionEntity, SessionGroupEntity } from "../../stores/entity";
import { getSessionGroupChannelId } from "../../lib/session-group";
import {
  getSessionGroupDisplayStatus,
  isGroupReviewAndActive,
} from "../session/sessionStatus";
import type { SessionGroupRow } from "./sessions-table-types";

export function useSessionGroupRows(channelId: string): SessionGroupRow[] {
  const sessionGroups = useEntityStore((s) => s.sessionGroups);
  const sessions = useEntityStore((s) => s.sessions);

  return useMemo(() => {
    return (Object.values(sessionGroups) as SessionGroupEntity[])
      .map((group) => {
        const groupSessions = (Object.values(sessions) as SessionEntity[])
          .filter((session) => session.sessionGroupId === group.id)
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
        const sessionStatuses = groupSessions.map((session) => session.status);
        const prUrl = group.prUrl as string | null | undefined;
        const status = getSessionGroupDisplayStatus(sessionStatuses, prUrl);
        const reviewAndActive = isGroupReviewAndActive(sessionStatuses, prUrl);

        return {
          ...group,
          latestSession,
          createdBySession,
          status,
          reviewAndActive,
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
  }, [channelId, sessionGroups, sessions]);
}
