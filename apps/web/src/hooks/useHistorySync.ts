import { useEffect } from "react";
import { useUIStore } from "../stores/ui";
import type { ActivePage } from "../stores/ui";

/** Parse the URL path into navigation state */
function parseNavFromPath(path: string): {
  channelId: string | null;
  sessionId: string | null;
  page: ActivePage;
} {
  // /settings
  if (path.startsWith("/settings")) {
    return { channelId: null, sessionId: null, page: "settings" };
  }
  // /c/:channelId/s/:sessionId
  const sessionMatch = path.match(/^\/c\/([^/]+)\/s\/([^/]+)/);
  if (sessionMatch) {
    return { channelId: sessionMatch[1], sessionId: sessionMatch[2], page: "main" };
  }
  // /c/:channelId
  const channelMatch = path.match(/^\/c\/([^/]+)/);
  if (channelMatch) {
    return { channelId: channelMatch[1], sessionId: null, page: "main" };
  }
  return { channelId: null, sessionId: null, page: "main" };
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
    const { channelId, sessionId, page } = parseNavFromPath(window.location.pathname);
    const initialChannel =
      page === "settings" ? null : (channelId ?? localStorage.getItem("trace:activeChannelId"));

    // Replace current history entry with proper state
    let path: string;
    if (page === "settings") {
      path = "/settings";
    } else if (initialChannel && sessionId) {
      path = `/c/${initialChannel}/s/${sessionId}`;
    } else if (initialChannel) {
      path = `/c/${initialChannel}`;
    } else {
      path = "/";
    }
    history.replaceState(
      { channelId: initialChannel, sessionId, page },
      "",
      path,
    );

    restoreNav(initialChannel, sessionId, page);

    function onPopState(e: PopStateEvent) {
      const state = e.state as {
        channelId: string | null;
        sessionId: string | null;
        page?: ActivePage;
      } | null;

      if (state) {
        restoreNav(state.channelId, state.sessionId, state.page);
      } else {
        // No state — parse from URL
        const nav = parseNavFromPath(window.location.pathname);
        restoreNav(nav.channelId, nav.sessionId, nav.page);
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
