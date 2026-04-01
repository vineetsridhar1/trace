import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";
import {
  CREATE_TERMINAL_MUTATION,
  DESTROY_TERMINAL_MUTATION,
  SESSION_TERMINALS_QUERY,
  START_SESSION_MUTATION,
} from "../../lib/mutations";
import { useDetailPanelStore } from "../../stores/detail-panel";
import { useEntityField, useEntityStore, useSessionIdsByGroup } from "../../stores/entity";
import type { SessionEntity } from "../../stores/entity";
import { useAuthStore } from "../../stores/auth";
import { useTerminalStore, useSessionGroupTerminals } from "../../stores/terminal";
import { useUIStore } from "../../stores/ui";
import { getSessionChannelId, getSessionGroupChannelId } from "../../lib/session-group";
import { optimisticallyInsertSession } from "../../lib/optimistic-session";
import { GroupHeader } from "./GroupHeader";
import { GroupTabStrip } from "./GroupTabStrip";
import type { OpenFileTab } from "./GroupTabStrip";
import { SessionDetailView } from "./SessionDetailView";
import { TerminalInstance } from "./TerminalInstance";
import { CheckpointOpenContext } from "./CheckpointOpenContext";
import { FileOpenContext } from "./FileOpenContext";
import { SidebarPanel } from "./SidebarPanel";
import type { SidebarTab } from "./SidebarPanel";
const MonacoFileViewer = lazy(() =>
  import("./MonacoFileViewer").then((m) => ({ default: m.MonacoFileViewer })),
);
const MonacoDiffViewer = lazy(() =>
  import("./MonacoDiffViewer").then((m) => ({ default: m.MonacoDiffViewer })),
);
import { getDisplaySessionStatus, isTerminalStatus } from "./sessionStatus";
import type { Terminal } from "@trace/gql";

const SESSION_GROUP_DETAIL_QUERY = gql`
  query SessionGroupDetail($id: ID!) {
    sessionGroup(id: $id) {
      id
      name
      slug
      status
      archivedAt
      branch
      prUrl
      workdir
      worktreeDeleted
      gitCheckpoints {
        id
        sessionId
        promptEventId
        commitSha
        subject
        author
        committedAt
        filesChanged
        createdAt
      }
      repo {
        id
        name
        defaultBranch
      }
      connection {
        state
        runtimeInstanceId
        runtimeLabel
        lastError
        retryCount
        canRetry
        canMove
      }
      channel {
        id
      }
      createdAt
      updatedAt
      sessions {
        id
        name
        agentStatus
        sessionStatus
        tool
        model
        hosting
        branch
        worktreeDeleted
        sessionGroupId
        connection {
          state
          runtimeInstanceId
          runtimeLabel
          lastError
          retryCount
          canRetry
          canMove
        }
        createdBy {
          id
          name
          avatarUrl
        }
        repo {
          id
          name
        }
        channel {
          id
        }
        createdAt
        updatedAt
      }
    }
  }
`;

export function SessionGroupDetailView({
  sessionGroupId,
  panelMode,
}: {
  sessionGroupId: string;
  panelMode?: boolean;
}) {
  const groupName = useEntityField("sessionGroups", sessionGroupId, "name");
  const groupRepo = useEntityField("sessionGroups", sessionGroupId, "repo") as
    | { id: string; name: string; defaultBranch?: string }
    | null
    | undefined;
  const groupBranch = useEntityField("sessionGroups", sessionGroupId, "branch") as
    | string
    | null
    | undefined;
  const groupPrUrl = useEntityField("sessionGroups", sessionGroupId, "prUrl") as
    | string
    | null
    | undefined;
  const groupArchivedAt = useEntityField("sessionGroups", sessionGroupId, "archivedAt") as
    | string
    | null
    | undefined;
  const groupConnection = useEntityField("sessionGroups", sessionGroupId, "connection") as
    | Record<string, unknown>
    | null
    | undefined;
  const groupWorktreeDeleted = useEntityField(
    "sessionGroups",
    sessionGroupId,
    "worktreeDeleted",
  ) as boolean | undefined;
  const activeSessionGroupId = useUIStore((s) => s.activeSessionGroupId);
  const activeSessionId = useUIStore((s) => s.activeSessionId);
  const activeTerminalId = useUIStore((s) => s.activeTerminalId);
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);
  const setActiveTerminalId = useUIStore((s) => s.setActiveTerminalId);
  const openTabIds = useUIStore((s) => s.openSessionTabsByGroup[sessionGroupId]);
  const openSessionTab = useUIStore((s) => s.openSessionTab);
  const closeSessionTab = useUIStore((s) => s.closeSessionTab);
  const initSessionTabs = useUIStore((s) => s.initSessionTabs);
  const toggleFullscreen = useDetailPanelStore((s) => s.toggleFullscreen);
  const isFullscreen = useDetailPanelStore((s) => s.isFullscreen);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const sessionsMap = useEntityStore((s) => s.sessions);
  const upsert = useEntityStore((s) => s.upsert);
  const upsertMany = useEntityStore((s) => s.upsertMany);
  const terminals = useSessionGroupTerminals(sessionGroupId);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("files");
  const [openFiles, setOpenFiles] = useState<OpenFileTab[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [highlightCheckpointId, setHighlightCheckpointId] = useState<string | null>(null);
  const [scrollToEventId, setScrollToEventId] = useState<string | null>(null);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const renameTerminal = useTerminalStore((s) => s.renameTerminal);

  const groupSessionIds = useSessionIdsByGroup(sessionGroupId);

  const groupSessions = useMemo(
    () => groupSessionIds.map((id) => sessionsMap[id]).filter(Boolean),
    [groupSessionIds, sessionsMap],
  );

  const sessionsByRecency = useMemo(() => {
    return [...groupSessions].sort((a, b) => {
      const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [groupSessions]);

  const sessionTabs = useMemo(() => {
    if (!openTabIds) return [];
    const sessionMap = new Map(groupSessions.map((s) => [s.id, s]));
    return openTabIds.map((id) => sessionMap.get(id)).filter((s): s is SessionEntity => s != null);
  }, [groupSessions, openTabIds]);

  // Fetch full group detail and merge into store
  useEffect(() => {
    client
      .query(SESSION_GROUP_DETAIL_QUERY, { id: sessionGroupId })
      .toPromise()
      .then((result) => {
        if (!result.data?.sessionGroup) return;
        const fetchedGroup = result.data.sessionGroup;
        const existingGroup = useEntityStore.getState().sessionGroups[fetchedGroup.id];
        upsert(
          "sessionGroups",
          fetchedGroup.id,
          existingGroup ? { ...existingGroup, ...fetchedGroup } : fetchedGroup,
        );
        const fetchedSessions = fetchedGroup.sessions;
        if (Array.isArray(fetchedSessions)) {
          const existingSessions = useEntityStore.getState().sessions;
          upsertMany(
            "sessions",
            fetchedSessions.map((session) => ({
              ...(existingSessions[session.id] ?? {}),
              ...session,
            })) as Array<SessionEntity & { id: string }>,
          );
        }
      });
  }, [sessionGroupId, upsert, upsertMany]);

  // Auto-select the most recent session if none is selected
  useEffect(() => {
    if (activeSessionGroupId !== sessionGroupId) return;
    if (sessionsByRecency.length === 0) return;
    if (activeSessionId && sessionsByRecency.some((session) => session.id === activeSessionId))
      return;
    setActiveSessionId(sessionsByRecency[0].id);
  }, [
    activeSessionGroupId,
    activeSessionId,
    sessionGroupId,
    sessionsByRecency,
    setActiveSessionId,
  ]);

  // Initialize open tabs with the most recent session
  useEffect(() => {
    if (sessionsByRecency.length === 0) return;
    initSessionTabs(sessionGroupId, [sessionsByRecency[0].id]);
  }, [sessionGroupId, sessionsByRecency, initSessionTabs]);

  // Clear terminal selection if the terminal was removed
  useEffect(() => {
    if (!activeTerminalId) return;
    if (terminals.some((terminal) => terminal.id === activeTerminalId)) return;
    setActiveTerminalId(null);
  }, [activeTerminalId, terminals, setActiveTerminalId]);

  // Auto-restore terminal tabs from server when returning to this session group.
  // The server returns all group terminals from any single session query,
  // so we only need to query one session.
  useEffect(() => {
    let aborted = false;
    const firstSessionId = groupSessionIds[0];
    if (!firstSessionId) return;

    const existingGroupTerminals = Object.values(useTerminalStore.getState().terminals).filter(
      (t) => t.sessionGroupId === sessionGroupId,
    );
    if (existingGroupTerminals.length > 0) return;

    client
      .query(SESSION_TERMINALS_QUERY, { sessionId: firstSessionId })
      .toPromise()
      .then((result) => {
        if (aborted) return;
        const serverTerminals = (result.data?.sessionTerminals as Terminal[] | undefined) ?? [];
        for (const terminal of serverTerminals) {
          if (!useTerminalStore.getState().terminals[terminal.id]) {
            addTerminal(terminal.id, terminal.sessionId, sessionGroupId, "active");
          }
        }
      });
    return () => {
      aborted = true;
    };
  }, [groupSessionIds, sessionGroupId, addTerminal]);

  const selectedSession =
    sessionTabs.find((session) => session.id === activeSessionId) ?? sessionTabs[0] ?? null;
  const selectedSessionIsOptimistic = selectedSession?._optimistic === true;
  const activeTerminal = terminals.find((terminal) => terminal.id === activeTerminalId) ?? null;

  useEffect(() => {
    if (selectedSessionIsOptimistic && showSidebar) {
      setShowSidebar(false);
    }
  }, [selectedSessionIsOptimistic, showSidebar]);

  const selectedSessionStatus = selectedSession
    ? getDisplaySessionStatus(
        selectedSession.sessionStatus,
        groupPrUrl ?? null,
        selectedSession.agentStatus,
        groupArchivedAt ?? null,
      )
    : "in_progress";

  const terminalAllowed = (() => {
    if (!selectedSession) return false;
    const hosting = selectedSession.hosting;
    const createdBy = selectedSession.createdBy as { id: string } | undefined;
    const isCloud = hosting === "cloud";
    const isLocalOwner = hosting === "local" && createdBy?.id === currentUserId;
    const isConnected = !groupConnection || groupConnection.state !== "disconnected";
    return (
      (isCloud || isLocalOwner) &&
      isConnected &&
      !isTerminalStatus(selectedSession.agentStatus, selectedSession.sessionStatus) &&
      !groupWorktreeDeleted
    );
  })();

  const handleOpenCheckpointPanel = useCallback((checkpointId?: string) => {
    setShowSidebar(true);
    setSidebarTab("git");
    setHighlightCheckpointId(checkpointId ?? null);
  }, []);

  const handleCheckpointClick = useCallback(
    (sessionId: string, promptEventId: string) => {
      openSessionTab(sessionGroupId, sessionId);
      setActiveSessionId(sessionId);
      setActiveTerminalId(null);
      setActiveFilePath(null);
      setScrollToEventId(promptEventId);
    },
    [sessionGroupId, openSessionTab, setActiveSessionId, setActiveTerminalId],
  );

  const handleScrollComplete = useCallback(() => {
    setScrollToEventId(null);
  }, []);

  const handleSidebarTabChange = useCallback((tab: SidebarTab) => {
    setSidebarTab(tab);
    if (tab !== "git") setHighlightCheckpointId(null);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setShowSidebar((prev) => {
      if (prev) setHighlightCheckpointId(null);
      return !prev;
    });
  }, []);

  const ensureSessionTerminals = useCallback(
    async (sessionId: string) => {
      const existing = terminals.filter((terminal) => terminal.sessionId === sessionId);
      if (existing.length > 0) return existing;

      const result = await client.query(SESSION_TERMINALS_QUERY, { sessionId }).toPromise();
      const restored = (result.data?.sessionTerminals as Terminal[] | undefined) ?? [];
      for (const terminal of restored) {
        if (!useTerminalStore.getState().terminals[terminal.id]) {
          addTerminal(terminal.id, terminal.sessionId, sessionGroupId, "active");
        }
      }
      return restored.map((terminal) => ({
        id: terminal.id,
        sessionId: terminal.sessionId,
        sessionGroupId,
        status: "active" as const,
      }));
    },
    [addTerminal, sessionGroupId, terminals],
  );

  const handleOpenTerminal = useCallback(async () => {
    if (!selectedSession || selectedSession._optimistic || !terminalAllowed) return;
    const existing = await ensureSessionTerminals(selectedSession.id);
    if (existing.length > 0) {
      setActiveSessionId(selectedSession.id);
      setActiveTerminalId(existing[0].id);
      return;
    }

    const result = await client
      .mutation(CREATE_TERMINAL_MUTATION, { sessionId: selectedSession.id, cols: 80, rows: 24 })
      .toPromise();
    if (result.data?.createTerminal) {
      const { id } = result.data.createTerminal as { id: string };
      addTerminal(id, selectedSession.id, sessionGroupId);
      setActiveSessionId(selectedSession.id);
      setActiveTerminalId(id);
    }
  }, [
    addTerminal,
    ensureSessionTerminals,
    selectedSession,
    sessionGroupId,
    setActiveSessionId,
    setActiveTerminalId,
    terminalAllowed,
  ]);

  const handleCloseTerminal = useCallback(
    async (terminalId: string) => {
      removeTerminal(terminalId);
      if (activeTerminalId === terminalId) {
        setActiveTerminalId(null);
      }
      await client.mutation(DESTROY_TERMINAL_MUTATION, { terminalId }).toPromise();
    },
    [activeTerminalId, removeTerminal, setActiveTerminalId],
  );

  const handleNewChat = useCallback(async () => {
    if (!selectedSession || selectedSession._optimistic) return;
    const resolvedChannelId =
      getSessionGroupChannelId(
        useEntityStore.getState().sessionGroups[sessionGroupId] ?? null,
        groupSessions,
      ) ?? getSessionChannelId(selectedSession);
    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: {
          tool: selectedSession.tool,
          model: selectedSession.model ?? undefined,
          hosting: selectedSession.hosting,
          channelId: resolvedChannelId ?? undefined,
          repoId: groupRepo?.id ?? (selectedSession.repo as { id: string } | null | undefined)?.id,
          branch: groupBranch ?? selectedSession.branch ?? undefined,
          sessionGroupId,
        },
      })
      .toPromise();

    const newSessionId = result.data?.startSession?.id;
    if (newSessionId) {
      optimisticallyInsertSession({
        id: newSessionId,
        sessionGroupId,
        tool: selectedSession.tool,
        model: selectedSession.model,
        hosting: selectedSession.hosting,
        channel: resolvedChannelId ? { id: resolvedChannelId } : null,
        repo: groupRepo ?? (selectedSession.repo as { id: string } | null | undefined),
        branch: groupBranch ?? selectedSession.branch,
      });
      openSessionTab(sessionGroupId, newSessionId);
      setActiveSessionId(newSessionId);
    }
  }, [
    groupSessions,
    groupBranch,
    groupRepo,
    openSessionTab,
    selectedSession,
    sessionGroupId,
    setActiveSessionId,
  ]);

  const handleSelectTerminal = useCallback(
    (sessionId: string | null, terminalId: string) => {
      if (sessionId) setActiveSessionId(sessionId);
      setActiveTerminalId(terminalId);
      setActiveFilePath(null);
    },
    [setActiveSessionId, setActiveTerminalId],
  );

  const handleFileClick = useCallback(
    (filePath: string) => {
      setOpenFiles((prev) => {
        if (prev.some((f) => f.filePath === filePath)) return prev;
        const fileName = filePath.split("/").pop() ?? filePath;
        return [...prev, { filePath, fileName }];
      });
      setActiveFilePath(filePath);
      setActiveTerminalId(null);
    },
    [setActiveTerminalId],
  );

  const handleDiffFileClick = useCallback(
    (filePath: string, status: string) => {
      const diffKey = `diff:${filePath}`;
      setOpenFiles((prev) => {
        if (prev.some((f) => f.filePath === diffKey)) return prev;
        const fileName = filePath.split("/").pop() ?? filePath;
        return [...prev, { filePath: diffKey, fileName, isDiff: true, diffStatus: status }];
      });
      setActiveFilePath(diffKey);
      setActiveTerminalId(null);
    },
    [setActiveTerminalId],
  );

  const handleSelectFile = useCallback(
    (filePath: string) => {
      setActiveFilePath(filePath);
      setActiveTerminalId(null);
    },
    [setActiveTerminalId],
  );

  const handleCloseFile = useCallback((filePath: string) => {
    setOpenFiles((prev) => prev.filter((f) => f.filePath !== filePath));
    setActiveFilePath((prev) => (prev === filePath ? null : prev));
  }, []);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
      setActiveTerminalId(null);
      setActiveFilePath(null);
    },
    [setActiveSessionId, setActiveTerminalId],
  );

  const handleCloseSession = useCallback(
    (sessionId: string) => {
      closeSessionTab(sessionGroupId, sessionId);
    },
    [closeSessionTab, sessionGroupId],
  );

  return (
    <CheckpointOpenContext.Provider value={handleOpenCheckpointPanel}>
      <FileOpenContext.Provider value={handleFileClick}>
        <div className="flex h-full flex-col overflow-hidden">
          <GroupHeader
            groupName={groupName as string | undefined}
            selectedSessionStatus={selectedSessionStatus}
            selectedSessionId={selectedSessionIsOptimistic ? null : (selectedSession?.id ?? null)}
            groupPrUrl={groupPrUrl}
            panelMode={panelMode}
            isFullscreen={isFullscreen}
            showSidebar={showSidebar}
            onClose={() => setActiveSessionId(null)}
            onToggleFullscreen={toggleFullscreen}
            onToggleSidebar={selectedSessionIsOptimistic ? () => {} : handleToggleSidebar}
          />

          <GroupTabStrip
            sessionTabs={sessionTabs}
            terminals={terminals}
            groupSessions={groupSessions}
            selectedSessionId={selectedSession?.id ?? null}
            activeTerminalId={activeTerminalId}
            openFiles={openFiles}
            activeFilePath={activeFilePath}
            onSelectSession={handleSelectSession}
            onCloseSession={handleCloseSession}
            canCloseSessions={sessionTabs.length > 1}
            onSelectTerminal={handleSelectTerminal}
            onCloseTerminal={handleCloseTerminal}
            onRenameTerminal={renameTerminal}
            onSelectFile={handleSelectFile}
            onCloseFile={handleCloseFile}
            onNewChat={handleNewChat}
            onOpenTerminal={handleOpenTerminal}
            canNewChat={!!selectedSession && !selectedSessionIsOptimistic}
            canOpenTerminal={!selectedSessionIsOptimistic && terminalAllowed}
          />

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              {activeFilePath?.startsWith("diff:") ? (
                <div className="h-full">
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center bg-[#1e1e1e]" />
                    }
                  >
                    <MonacoDiffViewer
                      key={activeFilePath}
                      sessionGroupId={sessionGroupId}
                      filePath={activeFilePath.slice(5)}
                      status={
                        openFiles.find((f) => f.filePath === activeFilePath)?.diffStatus ?? "M"
                      }
                      defaultBranch={groupRepo?.defaultBranch ?? "main"}
                    />
                  </Suspense>
                </div>
              ) : activeFilePath ? (
                <div className="h-full">
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center bg-[#1e1e1e]" />
                    }
                  >
                    <MonacoFileViewer
                      key={activeFilePath}
                      sessionGroupId={sessionGroupId}
                      filePath={activeFilePath}
                    />
                  </Suspense>
                </div>
              ) : activeTerminal ? (
                <div className="h-full bg-[#0a0a0a]">
                  <TerminalInstance terminalId={activeTerminal.id} visible />
                </div>
              ) : selectedSessionIsOptimistic ? (
                <div className="flex h-full items-center justify-center px-6 text-center">
                  <div className="max-w-sm space-y-2">
                    <p className="text-sm font-medium text-foreground">Creating session...</p>
                    <p className="text-sm text-muted-foreground">
                      The session is being created in the background. Input and runtime controls
                      will unlock once the real session ID is ready.
                    </p>
                  </div>
                </div>
              ) : selectedSession ? (
                <SessionDetailView
                  sessionId={selectedSession.id}
                  hideHeader
                  scrollToEventId={scrollToEventId}
                  onScrollComplete={handleScrollComplete}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Select a chat tab to continue.
                </div>
              )}
            </div>
            {showSidebar && !selectedSessionIsOptimistic && (
              <div className="h-full w-[260px] shrink-0 border-l border-[#2d2d2d]">
                <SidebarPanel
                  sessionGroupId={sessionGroupId}
                  activeSessionId={selectedSession?.id ?? null}
                  activeTab={sidebarTab}
                  onTabChange={handleSidebarTabChange}
                  onFileClick={handleFileClick}
                  onDiffFileClick={handleDiffFileClick}
                  highlightCheckpointId={highlightCheckpointId}
                  onCheckpointClick={handleCheckpointClick}
                />
              </div>
            )}
          </div>
        </div>
      </FileOpenContext.Provider>
    </CheckpointOpenContext.Provider>
  );
}
