import type { SidebarSessionScope } from "./ChannelOwnedSessions";

export const SIDEBAR_SESSION_SCOPES_KEY = "trace:sidebar-session-scopes";

export type SidebarSessionScopes = Record<string, SidebarSessionScope>;

type SidebarSessionScopeStorage = Pick<Storage, "getItem" | "setItem">;

export function isSidebarSessionScope(value: unknown): value is SidebarSessionScope {
  return value === "mine" || value === "all";
}

export function getSidebarSessionScope(
  scopes: SidebarSessionScopes,
  channelId: string,
): SidebarSessionScope {
  return scopes[channelId] ?? "mine";
}

export function readSidebarSessionScopes(
  storage: Pick<Storage, "getItem"> = localStorage,
): SidebarSessionScopes {
  const rawScopes = storage.getItem(SIDEBAR_SESSION_SCOPES_KEY);
  if (!rawScopes) return {};

  try {
    const parsed: unknown = JSON.parse(rawScopes);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, SidebarSessionScope] =>
        isSidebarSessionScope(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

export function writeSidebarSessionScopes(
  scopes: SidebarSessionScopes,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(SIDEBAR_SESSION_SCOPES_KEY, JSON.stringify(scopes));
}

export function toggleSidebarSessionScope(
  channelId: string,
  storage: SidebarSessionScopeStorage = localStorage,
): SidebarSessionScopes {
  const storedScopes = readSidebarSessionScopes(storage);
  const current = getSidebarSessionScope(storedScopes, channelId);
  const next: SidebarSessionScope = current === "mine" ? "all" : "mine";
  const nextScopes = { ...storedScopes, [channelId]: next };

  writeSidebarSessionScopes(nextScopes, storage);
  return nextScopes;
}
