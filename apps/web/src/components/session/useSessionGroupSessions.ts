import { useMemo } from "react";
import { useEntitiesByIds, useSessionIdsByGroup } from "@trace/client-core";
import type { SessionEntity } from "@trace/client-core";

function sessionMessageTimestamp(session: SessionEntity): string | null {
  return session.lastMessageAt ?? session.lastUserMessageAt ?? null;
}

function compareSessionsByRecency(a: SessionEntity, b: SessionEntity): number {
  const aMessageAt = sessionMessageTimestamp(a);
  const bMessageAt = sessionMessageTimestamp(b);

  if (aMessageAt && bMessageAt) {
    const diff = new Date(bMessageAt).getTime() - new Date(aMessageAt).getTime();
    if (diff !== 0) return diff;
  } else if (aMessageAt) {
    return -1;
  } else if (bMessageAt) {
    return 1;
  }

  const updatedDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  if (updatedDiff !== 0) return updatedDiff;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

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
    return [...groupSessions].sort(compareSessionsByRecency);
  }, [groupSessions]);

  const sessionTabs = useMemo(() => {
    if (!openTabIds) return sessionsByRecency;
    const openIndex = new Map(openTabIds.map((sessionId, index) => [sessionId, index]));
    return [...sessionsByRecency].sort((a, b) => {
      const aIndex = openIndex.get(a.id);
      const bIndex = openIndex.get(b.id);
      if (aIndex != null && bIndex != null) return aIndex - bIndex;
      if (aIndex != null) return -1;
      if (bIndex != null) return 1;
      return 0;
    });
  }, [openTabIds, sessionsByRecency]);

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
