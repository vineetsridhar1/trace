import { useEffect } from "react";
import { buildPath, resolveOptimisticSessionRedirect, useUIStore } from "../stores/ui";
import type { ActivePage } from "../stores/ui";

function parseNavFromPath(path: string): {
  channelId: string | null;
  sessionGroupId: string | null;
  sessionId: string | null;
  chatId: string | null;
  page: ActivePage;
} {
  if (path.startsWith("/settings")) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      page: "settings",
    };
  }
  if (path.startsWith("/inbox")) {
    return { channelId: null, sessionGroupId: null, sessionId: null, chatId: null, page: "inbox" };
  }
  if (path.startsWith("/tickets")) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      page: "tickets",
    };
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
    const parsedNav = parseNavFromPath(window.location.pathname);
    const initialRedirect = resolveOptimisticSessionRedirect(
      parsedNav.sessionGroupId,
      parsedNav.sessionId,
    );
    const { channelId, sessionGroupId, sessionId, chatId, page } = initialRedirect ?? parsedNav;
    const initialChat =
      page === "settings" || page === "inbox" || page === "tickets" || channelId
        ? null
        : (chatId ?? localStorage.getItem("trace:activeChatId"));
    const initialChannel =
      page === "settings" || page === "inbox" || page === "tickets" || initialChat
        ? null
        : (channelId ?? localStorage.getItem("trace:activeChannelId"));
    const initialSessionGroupId =
      page === "settings" || page === "inbox" || page === "tickets" || initialChat
        ? null
        : (sessionGroupId ?? localStorage.getItem("trace:activeSessionGroupId"));
    const initialSessionId =
      page === "settings" || page === "inbox" || page === "tickets" || initialChat
        ? null
        : (sessionId ?? localStorage.getItem("trace:activeSessionId"));

    const path = buildPath(
      initialChannel,
      initialSessionGroupId,
      initialSessionId,
      page,
      initialChat,
    );

    history.replaceState(
      {
        channelId: initialChannel,
        sessionGroupId: initialSessionGroupId,
        sessionId: initialSessionId,
        page,
        chatId: initialChat,
      },
      "",
      path,
    );

    restoreNav(initialChannel, initialSessionGroupId, initialSessionId, page, initialChat);

    function onPopState(e: PopStateEvent) {
      const state = e.state as {
        channelId: string | null;
        sessionGroupId: string | null;
        sessionId: string | null;
        chatId?: string | null;
        page?: ActivePage;
      } | null;

      if (state) {
        const redirect = resolveOptimisticSessionRedirect(state.sessionGroupId, state.sessionId);
        if (redirect) {
          history.replaceState(
            redirect,
            "",
            buildPath(
              redirect.channelId,
              redirect.sessionGroupId,
              redirect.sessionId,
              redirect.page,
              redirect.chatId,
            ),
          );
          restoreNav(
            redirect.channelId,
            redirect.sessionGroupId,
            redirect.sessionId,
            redirect.page,
            redirect.chatId,
          );
          return;
        }

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
      const redirect = resolveOptimisticSessionRedirect(nav.sessionGroupId, nav.sessionId);
      if (redirect) {
        history.replaceState(
          redirect,
          "",
          buildPath(
            redirect.channelId,
            redirect.sessionGroupId,
            redirect.sessionId,
            redirect.page,
            redirect.chatId,
          ),
        );
        restoreNav(
          redirect.channelId,
          redirect.sessionGroupId,
          redirect.sessionId,
          redirect.page,
          redirect.chatId,
        );
        return;
      }
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
