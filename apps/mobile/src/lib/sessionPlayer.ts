import { router } from "expo-router";
import { useEntityStore } from "@trace/client-core";
import { selectActiveSessionIds } from "@/lib/activeSessions";
import { fetchSessionGroupDetail } from "@/hooks/useSessionGroupDetail";
import { fetchSessionDetail } from "@/hooks/useSessionDetail";
import { useMobileUIStore } from "@/stores/ui";

/**
 * Opens the dedicated session page for any session the user can access.
 * Returns `false` when no session id or session-group id is available so
 * callers can short-circuit.
 */
export function tryOpenSessionPlayer(sessionId: string | null | undefined): boolean {
  if (!sessionId) return false;

  const ui = useMobileUIStore.getState();
  const sessionGroupId = useEntityStore.getState().sessions[sessionId]?.sessionGroupId;
  if (!sessionGroupId) return false;

  const activeIds = selectActiveSessionIds(useEntityStore.getState());
  const activeIndex = activeIds.indexOf(sessionId);
  if (activeIndex >= 0) ui.setActiveAccessoryIndex(activeIndex);

  ui.setOverlaySessionId(sessionId);
  router.push(`/sessions/${sessionGroupId}/${sessionId}` as never);
  return true;
}

export function closeSessionPlayer(): void {
  const ui = useMobileUIStore.getState();
  ui.setOverlaySessionId(null);
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/(authed)/(tabs)/(home)" as never);
}

/**
 * Warms the Zustand entity store with the data the standalone session page
 * needs before navigation. Intended to be called only from confirmed open
 * actions, not list `onPressIn`, because touch-down also fires during scroll
 * gestures.
 *
 * Fire-and-forget. A prefetch failure only logs a warning — the page's own
 * fetch hooks will run and surface the canonical error state.
 */
export function prefetchSessionPlayer(sessionId: string): void {
  void fetchSessionDetail(sessionId).catch((error) => {
    console.warn("[prefetchSessionPlayer] session detail failed", error);
  });

  const groupId = useEntityStore.getState().sessions[sessionId]?.sessionGroupId;
  if (groupId) {
    void fetchSessionGroupDetail(groupId).catch((error) => {
      console.warn("[prefetchSessionPlayer] group detail failed", error);
    });
  }
  // If groupId isn't in the store yet (deep link / push tap), the session
  // fetch chains the group fetch itself once the response lands.
}
