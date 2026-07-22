import { useEffect } from "react";
import {
  buildPath,
  getCurrentNavigationState,
  resolveOptimisticSessionRedirect,
  useUIStore,
} from "../stores/ui";
import type { ActivePage } from "../stores/ui";
import type { ChannelSubPage } from "../stores/ui";
import { blockNavigation } from "../lib/navigation-blocker";

type LegacyActivePage = ActivePage | "connections";

function parseNavFromPath(path: string): {
  channelId: string | null;
  sessionGroupId: string | null;
  sessionId: string | null;
  chatId: string | null;
  page: ActivePage;
  channelSubPage: ChannelSubPage;
  searchQuery: string;
} {
  if (path.startsWith("/settings")) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      page: "settings",
      channelSubPage: null,
      searchQuery: "",
    };
  }
  if (path.startsWith("/create")) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      page: "create",
      channelSubPage: null,
      searchQuery: "",
    };
  }
  if (path.startsWith("/search")) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      page: "search",
      channelSubPage: null,
      searchQuery: new URLSearchParams(window.location.search).get("q") ?? "",
    };
  }
  if (path.startsWith("/inbox")) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      page: "inbox",
      channelSubPage: null,
      searchQuery: "",
    };
  }
  if (path.startsWith("/connections")) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      page: "settings",
      channelSubPage: null,
      searchQuery: "",
    };
  }
  if (path.startsWith("/tickets")) {
    return {
      channelId: null,
      sessionGroupId: null,
      sessionId: null,
      chatId: null,
      page: "tickets",
      channelSubPage: null,
      searchQuery: "",
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
      channelSubPage: null,
      searchQuery: "",
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
      channelSubPage: null,
      searchQuery: "",
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
      channelSubPage: null,
      searchQuery: "",
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
      channelSubPage: null,
      searchQuery: "",
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
      channelSubPage: null,
      searchQuery: "",
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
      channelSubPage: null,
      searchQuery: "",
    };
  }

  return {
    channelId: null,
    sessionGroupId: null,
    sessionId: null,
    chatId: null,
    page: "main",
    channelSubPage: null,
    searchQuery: "",
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
        channelSubPage?: ChannelSubPage,
        searchQuery?: string,
      ) => void;
    }) => s._restoreNav,
  );
  const setSettingsInitialTab = useUIStore((s) => s.setSettingsInitialTab);

  useEffect(() => {
    if (window.location.pathname.startsWith("/connections")) {
      setSettingsInitialTab("connections");
    }
    const parsedNav = parseNavFromPath(window.location.pathname);
    const initialRedirect = resolveOptimisticSessionRedirect(
      parsedNav.sessionGroupId,
      parsedNav.sessionId,
    );
    const { channelId, sessionGroupId, sessionId, chatId, page } = initialRedirect ?? parsedNav;
    const isTopLevelPage =
      page === "create" || page === "settings" || page === "inbox" || page === "tickets" || page === "search";
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

    const searchQuery = page === "search" ? parsedNav.searchQuery : "";
    const path =
      page === "search"
        ? `/search?q=${encodeURIComponent(searchQuery)}`
        : buildPath(initialChannel, initialSessionGroupId, initialSessionId, page, initialChat);

    history.replaceState(
      {
        channelId: initialChannel,
        sessionGroupId: initialSessionGroupId,
        sessionId: initialSessionId,
        page,
        chatId: initialChat,
        channelSubPage: null,
        searchQuery,
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
      null,
      searchQuery,
    );

    function applyPopState(e: PopStateEvent) {
      const state = e.state as {
        channelId: string | null;
        sessionGroupId: string | null;
        sessionId: string | null;
        chatId?: string | null;
        page?: LegacyActivePage;
        channelSubPage?: ChannelSubPage;
        searchQuery?: string;
      } | null;

      if (state) {
        if (state.page === "connections") {
          setSettingsInitialTab("connections");
          restoreNav(null, null, null, "settings", null, null);
          return;
        }
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
          state.channelSubPage,
          state.searchQuery,
        );
        return;
      }

      const nav = parseNavFromPath(window.location.pathname);
      if (window.location.pathname.startsWith("/connections")) {
        setSettingsInitialTab("connections");
      }
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
        nav.channelSubPage,
        nav.searchQuery,
      );
    }

    function onPopState(e: PopStateEvent) {
      const targetUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const targetState = e.state as { sessionGroupId?: string | null } | null;
      const targetSessionGroupId =
        targetState?.sessionGroupId ?? parseNavFromPath(window.location.pathname).sessionGroupId;
      const current = getCurrentNavigationState();
      if (
        current.sessionGroupId &&
        targetSessionGroupId !== current.sessionGroupId &&
        blockNavigation(() => {
          history.pushState(e.state, "", targetUrl);
          applyPopState(e);
        })
      ) {
        history.replaceState(
          current,
          "",
          buildPath(
            current.channelId,
            current.sessionGroupId,
            current.sessionId,
            current.page,
            current.chatId,
          ),
        );
        return;
      }
      applyPopState(e);
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
  }, [restoreNav, setSettingsInitialTab]);
}
