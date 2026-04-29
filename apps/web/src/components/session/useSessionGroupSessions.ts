import { useMemo } from "react";
import {
  filterUserVisibleSessions,
  useEntitiesByIds,
  useSessionIdsByGroup,
} from "@trace/client-core";
import type { SessionEntity } from "@trace/client-core";

export function useSessionGroupSessions(
  sessionGroupId: string,
  openTabIds: string[] | undefined,
  activeSessionId: string | null,
) {
  const groupSessionIds = useSessionIdsByGroup(sessionGroupId);
  const groupSessionEntities = useEntitiesByIds("sessions", groupSessionIds);

  const groupSessions = useMemo(
    () =>
      filterUserVisibleSessions(
        groupSessionEntities.filter((session): session is SessionEntity => session != null),
      ),
    [groupSessionEntities],
  );

  const sessionsByRecency = useMemo(() => {
    return [...groupSessions].sort((a, b) => {
      const aRecency = a.lastMessageAt ?? a.updatedAt;
      const bRecency = b.lastMessageAt ?? b.updatedAt;
      const diff = new Date(bRecency).getTime() - new Date(aRecency).getTime();
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [groupSessions]);

  const sessionTabs = useMemo(() => {
    if (!openTabIds) return [];
    const sessionMap = new Map(
      groupSessions.map((session: SessionEntity) => [session.id, session]),
    );
    return openTabIds
      .map((sessionId) => sessionMap.get(sessionId))
      .filter((session): session is SessionEntity => session != null);
  }, [groupSessions, openTabIds]);

  const selectedSession = useMemo(
    () =>
      sessionTabs.find((session: SessionEntity) => session.id === activeSessionId) ??
      sessionTabs[0] ??
      null,
    [activeSessionId, sessionTabs],
  );

  return {
    groupSessions,
    sessionsByRecency,
    selectedSession,
    sessionTabs,
  };
}
