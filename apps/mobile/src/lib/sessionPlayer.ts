import { useEntityStore } from "@trace/client-core";
import { selectActiveSessionIds } from "@/lib/activeSessions";
import { useMobileUIStore, type SessionPlayerAnchor } from "@/stores/ui";

export function tryOpenSessionPlayer(
  sessionId: string | null | undefined,
  anchor?: SessionPlayerAnchor | null,
): boolean {
  if (!sessionId) return false;
  const ids = selectActiveSessionIds(useEntityStore.getState());
  const index = ids.indexOf(sessionId);
  if (index < 0) return false;

  const ui = useMobileUIStore.getState();
  ui.setActiveAccessoryIndex(index);
  ui.setSessionPlayerAnchor(anchor ?? null);
  ui.setSessionPlayerOpen(true);
  return true;
}

export function closeSessionPlayer(): void {
  useMobileUIStore.getState().setSessionPlayerOpen(false);
}
