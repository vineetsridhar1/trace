import { useEntityStore } from "@trace/client-core";
import { selectActiveSessionIds } from "@/lib/activeSessions";
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
