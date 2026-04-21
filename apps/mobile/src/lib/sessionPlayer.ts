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
export function tryOpenSessionPlayer(
  sessionId: string | null | undefined,
): boolean {
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
 * Tracks in-flight prefetches so rapid presses coalesce into one network
 * round-trip per session/group. Entries clear once the request settles.
 */
const inFlightSessionFetches = new Set<string>();
const inFlightGroupFetches = new Set<string>();

/**
 * Warms the Zustand entity store with the data the Session Player needs
 * before it mounts. Intended to be called on `onPressIn` of session rows so
 * the ~150–300 ms between touch-down and the spring landing overlaps with
 * the network round-trip. When the overlay mounts, `useEnsureSessionGroupDetail`
 * and `useSessionDetail` find cached data in the store and skip the
 * loading-spinner → content swap that causes first-open lag.
 *
 * Fire-and-forget. Errors are swallowed — the real fetches inside the
 * overlay hooks will retry and surface their own error states.
 */
export function prefetchSessionPlayer(sessionId: string | null | undefined): void {
  if (!sessionId) return;

  if (!inFlightSessionFetches.has(sessionId)) {
    inFlightSessionFetches.add(sessionId);
    void fetchSessionDetail(sessionId).finally(() => {
      inFlightSessionFetches.delete(sessionId);
    });
  }

  const session = useEntityStore.getState().sessions[sessionId];
  const groupId = session?.sessionGroupId;
  if (groupId && !inFlightGroupFetches.has(groupId)) {
    inFlightGroupFetches.add(groupId);
    void fetchSessionGroupDetail(groupId).finally(() => {
      inFlightGroupFetches.delete(groupId);
    });
  }
}
