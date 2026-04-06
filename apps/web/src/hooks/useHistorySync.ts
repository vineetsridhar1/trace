import { useEffect } from "react";
import { useUIStore } from "../stores/ui";
import type { ActivePage } from "../stores/ui";

function parseNavFromPath(path: string): {
  channelId: string | null;
  sessionGroupId: string | null;
  sessionId: string | null;
  chatId: string | null;
  aiConversationId: string | null;
  page: ActivePage;
} {
  if (path.startsWith("/settings")) {
    return { channelId: null, sessionGroupId: null, sessionId: null, chatId: null, aiConversationId: null, page: "settings" };
  }
  if (path.startsWith("/inbox")) {
    return { channelId: null, sessionGroupId: null, sessionId: null, chatId: null, aiConversationId: null, page: "inbox" };
  }

  const conversationDetailMatch = path.match(/^\/conversations\/([^/]+)/);
  if (conversationDetailMatch) {
    return { channelId: null, sessionGroupId: null, sessionId: null, chatId: null, aiConversationId: conversationDetailMatch[1], page: "ai-conversations" };
  }
  if (path.startsWith("/conversations")) {
    return { channelId: null, sessionGroupId: null, sessionId: null, chatId: null, aiConversationId: null, page: "ai-conversations" };
  }

  const chatMatch = path.match(/^\/dm\/([^/]+)/);
  if (chatMatch) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: chatMatch[1],
      aiConversationId: null,
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
      aiConversationId: null,
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
      aiConversationId: null,
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
      aiConversationId: null,
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
      aiConversationId: null,
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
      aiConversationId: null,
      page: "main",
    };
  }

  return { channelId: null, sessionGroupId: null, sessionId: null, chatId: null, aiConversationId: null, page: "main" };
}

export function useHistorySync() {
  const restoreNav = useUIStore((s) => s._restoreNav);

  useEffect(() => {
    const { channelId, sessionGroupId, sessionId, chatId, aiConversationId, page } = parseNavFromPath(
      window.location.pathname,
    );
    const isSpecialPage = page === "settings" || page === "inbox" || page === "ai-conversations";
    const initialChat =
      (isSpecialPage || channelId)
        ? null
        : (chatId ?? localStorage.getItem("trace:activeChatId"));
    const initialChannel =
      (isSpecialPage || initialChat)
        ? null
        : (channelId ?? localStorage.getItem("trace:activeChannelId"));
    const initialSessionGroupId =
      (isSpecialPage || initialChat)
        ? null
        : (sessionGroupId ?? localStorage.getItem("trace:activeSessionGroupId"));
    const initialSessionId =
      (isSpecialPage || initialChat)
        ? null
        : (sessionId ?? localStorage.getItem("trace:activeSessionId"));
    const initialAiConversationId = page === "ai-conversations" ? aiConversationId : null;

    let path: string;
    if (page === "settings") {
      path = "/settings";
    } else if (page === "inbox") {
      path = "/inbox";
    } else if (page === "ai-conversations" && initialAiConversationId) {
      path = `/conversations/${initialAiConversationId}`;
    } else if (page === "ai-conversations") {
      path = "/conversations";
    } else if (initialChat) {
      path = `/dm/${initialChat}`;
    } else if (initialChannel && initialSessionGroupId && initialSessionId) {
      path = `/c/${initialChannel}/g/${initialSessionGroupId}/s/${initialSessionId}`;
    } else if (initialChannel && initialSessionGroupId) {
      path = `/c/${initialChannel}/g/${initialSessionGroupId}`;
    } else if (initialSessionGroupId && initialSessionId) {
      path = `/g/${initialSessionGroupId}/s/${initialSessionId}`;
    } else if (initialSessionGroupId) {
      path = `/g/${initialSessionGroupId}`;
    } else if (initialChannel) {
      path = `/c/${initialChannel}`;
    } else {
      path = "/";
    }

    history.replaceState(
      { channelId: initialChannel, sessionGroupId: initialSessionGroupId, sessionId: initialSessionId, page, chatId: initialChat, aiConversationId: initialAiConversationId },
      "",
      path,
    );

    restoreNav(initialChannel, initialSessionGroupId, initialSessionId, page, initialChat, initialAiConversationId);

    function onPopState(e: PopStateEvent) {
      const state = e.state as {
        channelId: string | null;
        sessionGroupId: string | null;
        sessionId: string | null;
        chatId?: string | null;
        aiConversationId?: string | null;
        page?: ActivePage;
      } | null;

      if (state) {
        restoreNav(
          state.channelId,
          state.sessionGroupId,
          state.sessionId,
          state.page,
          state.chatId,
          state.aiConversationId,
        );
        return;
      }

      const nav = parseNavFromPath(window.location.pathname);
      restoreNav(nav.channelId, nav.sessionGroupId, nav.sessionId, nav.page, nav.chatId, nav.aiConversationId);
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
