import type { ActivePage, ChannelSubPage } from "./ui";
import { useEntityStore } from "@trace/client-core";
import type { SessionEntity } from "@trace/client-core";
import { getSessionChannelId, getSessionGroupChannelId } from "@trace/client-core";

export function buildPath(
  channelId: string | null,
  sessionGroupId: string | null,
  sessionId: string | null,
  page: ActivePage = "main",
  chatId: string | null = null,
  projectId: string | null = null,
): string {
  if (page === "settings") return "/settings";
  if (page === "inbox") return "/inbox";
  if (page === "connections") return "/connections";
  if (page === "tickets") return "/tickets";
  if (page === "projects" && projectId) return `/projects/${projectId}`;
  if (page === "projects") return "/projects";
  if (chatId) return `/dm/${chatId}`;
  if (channelId && sessionGroupId && sessionId) {
    return `/c/${channelId}/g/${sessionGroupId}/s/${sessionId}`;
  }
  if (channelId && sessionGroupId) return `/c/${channelId}/g/${sessionGroupId}`;
  if (sessionGroupId && sessionId) return `/g/${sessionGroupId}/s/${sessionId}`;
  if (sessionGroupId) return `/g/${sessionGroupId}`;
  if (channelId) return `/c/${channelId}`;
  return "/";
}

export function pushNav(
  channelId: string | null,
  sessionGroupId: string | null,
  sessionId: string | null,
  page: ActivePage = "main",
  chatId: string | null = null,
  channelSubPage: ChannelSubPage = null,
  projectId: string | null = null,
): void {
  const path = buildPath(channelId, sessionGroupId, sessionId, page, chatId, projectId);
  history.pushState(
    { channelId, sessionGroupId, sessionId, page, chatId, channelSubPage, projectId },
    "",
    path,
  );
}

export function replaceNav(
  channelId: string | null,
  sessionGroupId: string | null,
  sessionId: string | null,
  page: ActivePage = "main",
  chatId: string | null = null,
  channelSubPage: ChannelSubPage = null,
  projectId: string | null = null,
): void {
  const path = buildPath(channelId, sessionGroupId, sessionId, page, chatId, projectId);
  history.replaceState(
    { channelId, sessionGroupId, sessionId, page, chatId, channelSubPage, projectId },
    "",
    path,
  );
}

export function persistActiveChannelId(channelId: string | null): void {
  if (channelId) {
    localStorage.setItem("trace:activeChannelId", channelId);
  } else {
    localStorage.removeItem("trace:activeChannelId");
  }
}

export function persistActiveChatId(chatId: string | null): void {
  if (chatId) {
    localStorage.setItem("trace:activeChatId", chatId);
  } else {
    localStorage.removeItem("trace:activeChatId");
  }
}

export function persistActiveSessionNav(
  sessionGroupId: string | null,
  sessionId: string | null,
): void {
  if (sessionGroupId) {
    localStorage.setItem("trace:activeSessionGroupId", sessionGroupId);
  } else {
    localStorage.removeItem("trace:activeSessionGroupId");
  }
  if (sessionId) {
    localStorage.setItem("trace:activeSessionId", sessionId);
  } else {
    localStorage.removeItem("trace:activeSessionId");
  }
}

export function resolveChannelIdForSessionGroup(
  sessionGroupId: string | null,
  fallback: string | null,
): string | null {
  if (!sessionGroupId) return fallback;
  const sessions = (Object.values(useEntityStore.getState().sessions) as SessionEntity[]).filter(
    (session: SessionEntity) => session.sessionGroupId === sessionGroupId,
  );
  const sessionGroup = useEntityStore.getState().sessionGroups[sessionGroupId];
  return getSessionGroupChannelId(sessionGroup, sessions) ?? fallback;
}

export function resolveChannelIdForSession(
  sessionId: string | null,
  fallback: string | null,
): string | null {
  if (!sessionId) return fallback;
  const session = useEntityStore.getState().sessions[sessionId];
  const channelId = getSessionChannelId(session);
  if (channelId) return channelId;
  return resolveChannelIdForSessionGroup(session?.sessionGroupId ?? null, fallback);
}

export function resolveSessionGroupIdForSession(
  sessionId: string | null,
  fallback: string | null,
): string | null {
  if (!sessionId) return fallback;
  const session = useEntityStore.getState().sessions[sessionId];
  return session?.sessionGroupId ?? fallback;
}
