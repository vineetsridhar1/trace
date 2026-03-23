import { useEffect } from "react";
import { useUIStore } from "../stores/ui";
import type { ActivePage } from "../stores/ui";

function parseNavFromPath(path: string): {
  channelId: string | null;
  sessionGroupId: string | null;
  sessionId: string | null;
  chatId: string | null;
  page: ActivePage;
} {
  if (path.startsWith("/settings")) {
    return { channelId: null, sessionGroupId: null, sessionId: null, chatId: null, page: "settings" };
  }
  if (path.startsWith("/inbox")) {
    return { channelId: null, sessionGroupId: null, sessionId: null, chatId: null, page: "inbox" };
  }

  const chatMatch = path.match(/^\/dm\/([^/]+)/);
  if (chatMatch) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: chatMatch[1],
      page: "main",
    };
  }

  const channelGroupSessionMatch = path.match(/^\/c\/([^/]+)\/g\/([^/]+)\/s\/([^/]+)/);
  if (channelGroupSessionMatch) {
    return {
      channelId: channelGroupSessionMatch[1],
      sessionGroupId: channelGroupSessionMatch[2],
      sessionId: channelGroupSessionMatch[3],
      chatId: null,
      page: "main",
    };
  }

  const channelGroupMatch = path.match(/^\/c\/([^/]+)\/g\/([^/]+)/);
  if (channelGroupMatch) {
    return {
      channelId: channelGroupMatch[1],
      sessionGroupId: channelGroupMatch[2],
      sessionId: null,
      chatId: null,
      page: "main",
    };
  }

  const groupSessionMatch = path.match(/^\/g\/([^/]+)\/s\/([^/]+)/);
  if (groupSessionMatch) {
    return {
      channelId: null,
      sessionGroupId: groupSessionMatch[1],
      sessionId: groupSessionMatch[2],
      chatId: null,
      page: "main",
    };
  }

  const groupMatch = path.match(/^\/g\/([^/]+)/);
  if (groupMatch) {
    return {
      channelId: null,
      sessionGroupId: groupMatch[1],
      sessionId: null,
      chatId: null,
      page: "main",
    };
  }

  const channelMatch = path.match(/^\/c\/([^/]+)/);
  if (channelMatch) {
    return {
      channelId: channelMatch[1],
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      page: "main",
    };
  }

  return { channelId: null, sessionGroupId: null, sessionId: null, chatId: null, page: "main" };
}

export function useHistorySync() {
  const restoreNav = useUIStore((s) => s._restoreNav);

  useEffect(() => {
    const { channelId, sessionGroupId, sessionId, chatId, page } = parseNavFromPath(
      window.location.pathname,
    );
    const initialChat =
      (page === "settings" || page === "inbox" || channelId)
        ? null
        : (chatId ?? localStorage.getItem("trace:activeChatId"));
    const initialChannel =
      (page === "settings" || page === "inbox" || initialChat)
        ? null
        : (channelId ?? localStorage.getItem("trace:activeChannelId"));

    let path: string;
    if (page === "settings") {
      path = "/settings";
    } else if (page === "inbox") {
      path = "/inbox";
    } else if (initialChat) {
      path = `/dm/${initialChat}`;
    } else if (initialChannel && sessionGroupId && sessionId) {
      path = `/c/${initialChannel}/g/${sessionGroupId}/s/${sessionId}`;
    } else if (initialChannel && sessionGroupId) {
      path = `/c/${initialChannel}/g/${sessionGroupId}`;
    } else if (sessionGroupId && sessionId) {
      path = `/g/${sessionGroupId}/s/${sessionId}`;
    } else if (sessionGroupId) {
      path = `/g/${sessionGroupId}`;
    } else if (initialChannel) {
      path = `/c/${initialChannel}`;
    } else {
      path = "/";
    }

    history.replaceState(
      { channelId: initialChannel, sessionGroupId, sessionId, page, chatId: initialChat },
      "",
      path,
    );

    restoreNav(initialChannel, sessionGroupId, sessionId, page, initialChat);

    function onPopState(e: PopStateEvent) {
      const state = e.state as {
        channelId: string | null;
        sessionGroupId: string | null;
        sessionId: string | null;
        chatId?: string | null;
        page?: ActivePage;
      } | null;

      if (state) {
        restoreNav(
          state.channelId,
          state.sessionGroupId,
          state.sessionId,
          state.page,
          state.chatId,
        );
        return;
      }

      const nav = parseNavFromPath(window.location.pathname);
      restoreNav(nav.channelId, nav.sessionGroupId, nav.sessionId, nav.page, nav.chatId);
    }

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
