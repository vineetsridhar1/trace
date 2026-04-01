import { useMemo } from "react";
import { useEntitiesByIds, useSessionIdsByGroup } from "../../stores/entity";
import type { SessionEntity } from "../../stores/entity";

export function useSessionGroupSessions(
  sessionGroupId: string,
  openTabIds: string[] | undefined,
  activeSessionId: string | null,
) {
  const groupSessionIds = useSessionIdsByGroup(sessionGroupId);
  const groupSessionEntities = useEntitiesByIds("sessions", groupSessionIds);

  const groupSessions = useMemo(
    () => groupSessionEntities.filter((session): session is SessionEntity => session != null),
    [groupSessionEntities],
  );

  const sessionsByRecency = useMemo(() => {
    return [...groupSessions].sort((a, b) => {
      const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [groupSessions]);

  const sessionTabs = useMemo(() => {
    if (!openTabIds) return [];
    const sessionMap = new Map(groupSessions.map((session) => [session.id, session]));
    return openTabIds
      .map((sessionId) => sessionMap.get(sessionId))
      .filter((session): session is SessionEntity => session != null);
  }, [groupSessions, openTabIds]);

  const selectedSession = useMemo(
    () => sessionTabs.find((session) => session.id === activeSessionId) ?? sessionTabs[0] ?? null,
    [activeSessionId, sessionTabs],
  );

  return {
    groupSessions,
    sessionsByRecency,
    selectedSession,
    sessionTabs,
  };
}
