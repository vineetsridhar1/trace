import { useEffect } from "react";
import { useUIStore } from "../stores/ui";

/** Parse the URL path into navigation state */
function parseNavFromPath(path: string): {
  channelId: string | null;
  sessionId: string | null;
} {
  // /c/:channelId/s/:sessionId
  const sessionMatch = path.match(/^\/c\/([^/]+)\/s\/([^/]+)/);
  if (sessionMatch) {
    return { channelId: sessionMatch[1], sessionId: sessionMatch[2] };
  }
  // /c/:channelId
  const channelMatch = path.match(/^\/c\/([^/]+)/);
  if (channelMatch) {
    return { channelId: channelMatch[1], sessionId: null };
  }
  return { channelId: null, sessionId: null };
}

/**
 * Syncs browser history with the UI navigation store.
 * - Initializes state from the current URL on mount
 * - Listens for popstate (browser back/forward) to update the store
 */
export function useHistorySync() {
  const restoreNav = useUIStore((s) => s._restoreNav);

  useEffect(() => {
    // Initialize from URL (or fall back to localStorage)
    const { channelId, sessionId } = parseNavFromPath(window.location.pathname);
    const initialChannel =
      channelId ?? localStorage.getItem("trace:activeChannelId");

    // Replace current history entry with proper state
    const path =
      initialChannel && sessionId
        ? `/c/${initialChannel}/s/${sessionId}`
        : initialChannel
          ? `/c/${initialChannel}`
          : "/";
    history.replaceState(
      { channelId: initialChannel, sessionId },
      "",
      path,
    );

    restoreNav(initialChannel, sessionId);

    function onPopState(e: PopStateEvent) {
      const state = e.state as {
        channelId: string | null;
        sessionId: string | null;
      } | null;

      if (state) {
        restoreNav(state.channelId, state.sessionId);
      } else {
        // No state — parse from URL
        const nav = parseNavFromPath(window.location.pathname);
        restoreNav(nav.channelId, nav.sessionId);
      }
    }

    // Handle mouse back/forward buttons (button 3 = back, button 4 = forward)
    // This covers macOS Electron where app-command doesn't fire
    function onMouseUp(e: MouseEvent) {
      if (e.button === 3) {
        e.preventDefault();
        history.back();
      } else if (e.button === 4) {
        e.preventDefault();
        history.forward();
      }
    }

    window.addEventListener("popstate", onPopState);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [restoreNav]);
}
