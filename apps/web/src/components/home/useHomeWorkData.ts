import { useMemo } from "react";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import { buildHomeWorkData } from "./home-work-data";

export function useHomeWorkData() {
  const currentUserId = useAuthStore((state: AuthState) => state.user?.id ?? null);
  const groups = useEntityStore((state) => state.sessionGroups);
  const sessions = useEntityStore((state) => state.sessions);
  const sessionIdsByGroup = useEntityStore((state) => state._sessionIdsByGroup);
  const inboxItems = useEntityStore((state) => state.inboxItems);

  return useMemo(
    () =>
      buildHomeWorkData({
        currentUserId,
        groups,
        sessions,
        sessionIdsByGroup,
        inboxItems,
      }),
    [currentUserId, groups, sessions, sessionIdsByGroup, inboxItems],
  );
}
