import { useCallback, useEffect, useState } from "react";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceRequestStore } from "../../stores/workspace-requests";
import type { WorkspaceSurface } from "./SidebarPanel";

const SESSION_WORKSPACE_TABS_KEY_PREFIX = "trace:session-workspace-tabs:";
const EMPTY_BROWSER_REQUESTS: Array<{ id: string; sessionGroupId: string; url: string }> = [];
const EMPTY_TERMINAL_REQUESTS: Array<{
  id: string;
  sessionGroupId: string;
  sessionId: string;
  terminalId: string;
  replaceTabId?: string;
  select: boolean;
}> = [];

export type DraftWorkspaceTab = {
  id: string;
  surface: WorkspaceSurface | null;
  initialUrl?: string;
};

interface WorkspaceTabRequestsOptions {
  sessionGroupId: string;
  setActiveSessionId: (sessionId: string | null) => void;
  setActiveTerminalId: (terminalId: string | null) => void;
}

export function useWorkspaceTabRequests({
  sessionGroupId,
  setActiveSessionId,
  setActiveTerminalId,
}: WorkspaceTabRequestsOptions) {
  const [draftTabs, setDraftTabs] = useState<DraftWorkspaceTab[]>(() =>
    readStoredWorkspaceTabs(sessionGroupId),
  );
  const [foregroundTabId, setForegroundTabId] = useState<string | null>(null);
  const [browserTitles, setBrowserTitles] = useState<Record<string, string>>({});
  const [tabReplacements, setTabReplacements] = useState<Record<string, string>>({});
  const browserRequests = useWorkspaceRequestStore(
    (state) => state.browserRequestsByGroup[sessionGroupId] ?? EMPTY_BROWSER_REQUESTS,
  );
  const terminalRequests = useWorkspaceRequestStore(
    (state) => state.terminalRequestsByGroup[sessionGroupId] ?? EMPTY_TERMINAL_REQUESTS,
  );
  const consumeBrowserRequests = useWorkspaceRequestStore((state) => state.consumeBrowserRequests);
  const consumeTerminalRequests = useWorkspaceRequestStore(
    (state) => state.consumeTerminalRequests,
  );

  useEffect(() => {
    try {
      localStorage.setItem(
        `${SESSION_WORKSPACE_TABS_KEY_PREFIX}${sessionGroupId}`,
        JSON.stringify(draftTabs),
      );
    } catch {
      // Persistence is optional when browser storage is unavailable.
    }
  }, [draftTabs, sessionGroupId]);

  useEffect(() => {
    if (browserRequests.length === 0) return;
    const requestedTabs = browserRequests.map((request) => ({
      id: `draft:${request.id}`,
      surface: "browser" as const,
      initialUrl: request.url,
    }));
    setDraftTabs((tabs) => [
      ...tabs,
      ...requestedTabs.filter((request) => !tabs.some((tab) => tab.id === request.id)),
    ]);
    setForegroundTabId(requestedTabs[requestedTabs.length - 1]!.id);
    consumeBrowserRequests(sessionGroupId);
  }, [browserRequests, consumeBrowserRequests, sessionGroupId]);

  useEffect(() => {
    if (terminalRequests.length === 0) return;
    const replacements = terminalRequests.filter(
      (request): request is typeof request & { replaceTabId: string } =>
        typeof request.replaceTabId === "string",
    );
    if (replacements.length > 0) {
      setTabReplacements((current) => ({
        ...current,
        ...Object.fromEntries(
          replacements.map((request) => [request.replaceTabId, `terminal:${request.terminalId}`]),
        ),
      }));
      const replacedTabIds = new Set(replacements.map((request) => request.replaceTabId));
      setDraftTabs((drafts) => drafts.filter((draft) => !replacedTabIds.has(draft.id)));
    }
    const selectedRequest = [...terminalRequests].reverse().find((request) => request.select);
    if (selectedRequest) {
      setForegroundTabId(`terminal:${selectedRequest.terminalId}`);
      setActiveSessionId(selectedRequest.sessionId);
      if (useUIStore.getState().activeSessionGroupId === sessionGroupId) {
        setActiveTerminalId(selectedRequest.terminalId);
      }
    }
    consumeTerminalRequests(sessionGroupId);
  }, [
    consumeTerminalRequests,
    sessionGroupId,
    setActiveSessionId,
    setActiveTerminalId,
    terminalRequests,
  ]);

  useEffect(() => {
    if (!foregroundTabId) return;
    const timeoutId = globalThis.setTimeout(() => setForegroundTabId(null), 0);
    return () => globalThis.clearTimeout(timeoutId);
  }, [foregroundTabId]);

  const handleTabReplacementsApplied = useCallback((sourceTabIds: string[]) => {
    setTabReplacements((current) => {
      const next = { ...current };
      for (const sourceTabId of sourceTabIds) delete next[sourceTabId];
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, []);

  const handleBrowserTitleChange = useCallback((browserId: string, title: string) => {
    setBrowserTitles((titles) =>
      titles[browserId] === title ? titles : { ...titles, [browserId]: title },
    );
  }, []);

  return {
    browserTitles,
    draftTabs,
    foregroundTabId,
    handleBrowserTitleChange,
    handleTabReplacementsApplied,
    setDraftTabs,
    setForegroundTabId,
    tabReplacements,
  };
}

function readStoredWorkspaceTabs(sessionGroupId: string): DraftWorkspaceTab[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(`${SESSION_WORKSPACE_TABS_KEY_PREFIX}${sessionGroupId}`);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDraftWorkspaceTab);
  } catch {
    return [];
  }
}

function isDraftWorkspaceTab(value: unknown): value is DraftWorkspaceTab {
  if (!value || typeof value !== "object") return false;
  const tab = value as Record<string, unknown>;
  return (
    typeof tab.id === "string" &&
    tab.surface !== "terminal" &&
    (tab.surface === null || isWorkspaceSurface(tab.surface)) &&
    (tab.initialUrl === undefined || typeof tab.initialUrl === "string")
  );
}

function isWorkspaceSurface(value: unknown): value is WorkspaceSurface {
  return (
    value === "browser" ||
    value === "terminal" ||
    value === "files" ||
    value === "changes"
  );
}
