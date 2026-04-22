import { useEntityStore } from "@trace/client-core";
import { selectActiveSessionIds } from "@/lib/activeSessions";
import { fetchSessionGroupDetail } from "@/hooks/useSessionGroupDetail";
import { fetchSessionDetail } from "@/hooks/useSessionDetail";
import { useMobileUIStore } from "@/stores/ui";

/**
 * Opens the Session Player (§10.8) for any session the user can access.
 * Returns `false` when no session id is provided so callers can short-circuit.
 *
 * If the session is currently in the active-sessions list (powering the
 * bottom accessory pager), the accessory's `activeAccessoryIndex` is synced
 * so the pager stays aligned when the Player closes.
 */
export function tryOpenSessionPlayer(sessionId: string | null | undefined): boolean {
  if (!sessionId) return false;

  const ui = useMobileUIStore.getState();

  const activeIds = selectActiveSessionIds(useEntityStore.getState());
  const activeIndex = activeIds.indexOf(sessionId);
  if (activeIndex >= 0) ui.setActiveAccessoryIndex(activeIndex);

  ui.setOverlaySessionId(sessionId);
  ui.setSessionPlayerOpen(true);
  return true;
}

export function closeSessionPlayer(): void {
  useMobileUIStore.getState().setSessionPlayerOpen(false);
}

/**
 * Warms the Zustand entity store with the data the Session Player needs
 * before it mounts. Intended to be called only from confirmed open actions,
 * not list `onPressIn`, because touch-down also fires during scroll gestures.
 * When the overlay mounts, its fetch hooks reuse the in-flight promise
 * (dedup lives in the fetch helpers) and the spinner branch short-circuits
 * if the group has already hydrated.
 *
 * Fire-and-forget. A prefetch failure only logs a warning — the overlay's
 * own fetch will run and surface the canonical error state.
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
