import { useEffect } from "react";
import { buildPath, resolveOptimisticSessionRedirect, useUIStore } from "../stores/ui";
import type { ActivePage } from "../stores/ui";
import type { ChannelSubPage } from "../stores/ui";

function parseNavFromPath(path: string): {
  channelId: string | null;
  sessionGroupId: string | null;
  sessionId: string | null;
  chatId: string | null;
  projectId: string | null;
  page: ActivePage;
  channelSubPage: ChannelSubPage;
} {
  if (path.startsWith("/settings")) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      projectId: null,
      page: "settings",
      channelSubPage: null,
    };
  }
  if (path.startsWith("/inbox")) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      projectId: null,
      page: "inbox",
      channelSubPage: null,
    };
  }
  if (path.startsWith("/connections")) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      projectId: null,
      page: "connections",
      channelSubPage: null,
    };
  }
  if (path.startsWith("/tickets")) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      projectId: null,
      page: "tickets",
      channelSubPage: null,
    };
  }
  const projectMatch = path.match(/^\/projects\/([^/]+)/);
  if (projectMatch) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      projectId: projectMatch[1],
      page: "projects",
      channelSubPage: null,
    };
  }
  if (path.startsWith("/projects")) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      projectId: null,
      page: "projects",
      channelSubPage: null,
    };
  }

  const chatMatch = path.match(/^\/dm\/([^/]+)/);
  if (chatMatch) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: chatMatch[1],
      projectId: null,
      page: "main",
      channelSubPage: null,
    };
  }

  const channelGroupSessionMatch = path.match(/^\/c\/([^/]+)\/g\/([^/]+)\/s\/([^/]+)/);
  if (channelGroupSessionMatch) {
    return {
      channelId: channelGroupSessionMatch[1],
      sessionGroupId: channelGroupSessionMatch[2],
      sessionId: channelGroupSessionMatch[3],
      chatId: null,
      projectId: null,
      page: "main",
      channelSubPage: null,
    };
  }

  const channelGroupMatch = path.match(/^\/c\/([^/]+)\/g\/([^/]+)/);
  if (channelGroupMatch) {
    return {
      channelId: channelGroupMatch[1],
      sessionGroupId: channelGroupMatch[2],
      sessionId: null,
      chatId: null,
      projectId: null,
      page: "main",
      channelSubPage: null,
    };
  }

  const groupSessionMatch = path.match(/^\/g\/([^/]+)\/s\/([^/]+)/);
  if (groupSessionMatch) {
    return {
      channelId: null,
      sessionGroupId: groupSessionMatch[1],
      sessionId: groupSessionMatch[2],
      chatId: null,
      projectId: null,
      page: "main",
      channelSubPage: null,
    };
  }

  const groupMatch = path.match(/^\/g\/([^/]+)/);
  if (groupMatch) {
    return {
      channelId: null,
      sessionGroupId: groupMatch[1],
      sessionId: null,
      chatId: null,
      projectId: null,
      page: "main",
      channelSubPage: null,
    };
  }

  const channelMatch = path.match(/^\/c\/([^/]+)/);
  if (channelMatch) {
    return {
      channelId: channelMatch[1],
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      projectId: null,
      page: "main",
      channelSubPage: null,
    };
  }

  return {
    channelId: null,
    sessionGroupId: null,
    sessionId: null,
    chatId: null,
    projectId: null,
    page: "main",
    channelSubPage: null,
  };
}

export function useHistorySync() {
  const restoreNav = useUIStore(
    (s: {
      _restoreNav: (
        channelId: string | null,
        sessionGroupId: string | null,
        sessionId: string | null,
        page?: ActivePage,
        chatId?: string | null,
        projectId?: string | null,
        channelSubPage?: ChannelSubPage,
      ) => void;
    }) => s._restoreNav,
  );

  useEffect(() => {
    const parsedNav = parseNavFromPath(window.location.pathname);
    const initialRedirect = resolveOptimisticSessionRedirect(
      parsedNav.sessionGroupId,
      parsedNav.sessionId,
    );
    const { channelId, sessionGroupId, sessionId, chatId, projectId, page } =
      initialRedirect ?? parsedNav;
    const isTopLevelPage =
      page === "settings" ||
      page === "inbox" ||
      page === "connections" ||
      page === "tickets" ||
      page === "projects";
    const initialChat =
      isTopLevelPage || channelId ? null : (chatId ?? localStorage.getItem("trace:activeChatId"));
    const initialChannel =
      isTopLevelPage || initialChat
        ? null
        : (channelId ?? localStorage.getItem("trace:activeChannelId"));
    const initialSessionGroupId =
      isTopLevelPage || initialChat
        ? null
        : (sessionGroupId ?? localStorage.getItem("trace:activeSessionGroupId"));
    const initialSessionId =
      isTopLevelPage || initialChat
        ? null
        : (sessionId ?? localStorage.getItem("trace:activeSessionId"));

    const path = buildPath(
      initialChannel,
      initialSessionGroupId,
      initialSessionId,
      page,
      initialChat,
      projectId,
    );

    history.replaceState(
      {
        channelId: initialChannel,
        sessionGroupId: initialSessionGroupId,
        sessionId: initialSessionId,
        page,
        chatId: initialChat,
        projectId,
        channelSubPage: null,
      },
      "",
      path,
    );

    restoreNav(
      initialChannel,
      initialSessionGroupId,
      initialSessionId,
      page,
      initialChat,
      projectId,
      null,
    );

    function onPopState(e: PopStateEvent) {
      const state = e.state as {
        channelId: string | null;
        sessionGroupId: string | null;
        sessionId: string | null;
        chatId?: string | null;
        projectId?: string | null;
        page?: ActivePage;
        channelSubPage?: ChannelSubPage;
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
              redirect.projectId,
            ),
          );
          restoreNav(
            redirect.channelId,
            redirect.sessionGroupId,
            redirect.sessionId,
            redirect.page,
            redirect.chatId,
            redirect.projectId,
            redirect.channelSubPage,
          );
          return;
        }

        restoreNav(
          state.channelId,
          state.sessionGroupId,
          state.sessionId,
          state.page,
          state.chatId,
          state.projectId,
          state.channelSubPage,
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
            redirect.projectId,
          ),
        );
        restoreNav(
          redirect.channelId,
          redirect.sessionGroupId,
          redirect.sessionId,
          redirect.page,
          redirect.chatId,
          redirect.projectId,
          redirect.channelSubPage,
        );
        return;
      }
      restoreNav(
        nav.channelId,
        nav.sessionGroupId,
        nav.sessionId,
        nav.page,
        nav.chatId,
        nav.projectId,
        nav.channelSubPage,
      );
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
