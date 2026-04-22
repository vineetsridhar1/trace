import { useCallback, useEffect, useState } from "react";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";
import { SESSION_TERMINALS_QUERY, START_SESSION_MUTATION } from "@trace/client-core";
import type { Terminal } from "@trace/gql";
import { useDetailPanelStore } from "../../stores/detail-panel";
import { useEntityField, useEntityStore } from "@trace/client-core";
import type { SessionEntity, SessionGroupEntity } from "@trace/client-core";
import { useTerminalStore, useSessionGroupTerminals } from "../../stores/terminal";
import { useUIStore } from "../../stores/ui";
import { getSessionChannelId, getSessionGroupChannelId } from "@trace/client-core";
import { optimisticallyInsertSession } from "../../lib/optimistic-session";
import { GroupHeader } from "./GroupHeader";
import { GroupTabStrip } from "./GroupTabStrip";
import { SessionGroupContentArea } from "./SessionGroupContentArea";
import { CheckpointOpenContext } from "./CheckpointOpenContext";
import { FileOpenContext } from "./FileOpenContext";
import { SidebarPanel } from "./SidebarPanel";
import type { SidebarTab } from "./SidebarPanel";
import { isBridgeInteractionAllowed, useBridgeRuntimeAccess } from "./useBridgeRuntimeAccess";
import { useSessionGroupSessions } from "./useSessionGroupSessions";
import { useTerminalActions } from "./useTerminalActions";
import { useFileActions } from "./useFileActions";
import { getDisplaySessionStatus, isTerminalStatus } from "./sessionStatus";
import { getLinkedCheckoutRuntimeInstanceId } from "../../lib/linked-checkout-access";
import { toast } from "sonner";

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
        autoRetryable
      }
      channel {
        id
      }
      setupStatus
      setupError
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
          autoRetryable
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
  key?: string | number;
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

  const activeSessionGroupId = useUIStore(
    (s: { activeSessionGroupId: string | null }) => s.activeSessionGroupId,
  );
  const activeSessionId = useUIStore((s: { activeSessionId: string | null }) => s.activeSessionId);
  const activeTerminalId = useUIStore(
    (s: { activeTerminalId: string | null }) => s.activeTerminalId,
  );
  const setActiveSessionId = useUIStore(
    (s: { setActiveSessionId: (id: string | null) => void }) => s.setActiveSessionId,
  );
  const setActiveTerminalId = useUIStore(
    (s: { setActiveTerminalId: (id: string | null) => void }) => s.setActiveTerminalId,
  );
  const openTabIds = useUIStore(
    (s: { openSessionTabsByGroup: Record<string, string[]> }) =>
      s.openSessionTabsByGroup[sessionGroupId],
  );
  const openSessionTab = useUIStore(
    (s: { openSessionTab: (groupId: string, sessionId: string) => void }) => s.openSessionTab,
  );
  const closeSessionTab = useUIStore(
    (s: { closeSessionTab: (groupId: string, sessionId: string) => void }) => s.closeSessionTab,
  );
  const initSessionTabs = useUIStore(
    (s: { initSessionTabs: (groupId: string, sessionIds: string[]) => void }) => s.initSessionTabs,
  );
  const toggleFullscreen = useDetailPanelStore(
    (s: { toggleFullscreen: () => void }) => s.toggleFullscreen,
  );
  const isFullscreen = useDetailPanelStore((s: { isFullscreen: boolean }) => s.isFullscreen);
  const upsert = useEntityStore(
    (s: { upsert: ReturnType<typeof useEntityStore.getState>["upsert"] }) => s.upsert,
  );
  const upsertMany = useEntityStore(
    (s: { upsertMany: ReturnType<typeof useEntityStore.getState>["upsertMany"] }) => s.upsertMany,
  );
  const terminals = useSessionGroupTerminals(sessionGroupId);

  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("files");
  const [highlightCheckpointId, setHighlightCheckpointId] = useState<string | null>(null);
  const [scrollToEventId, setScrollToEventId] = useState<string | null>(null);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const renameTerminal = useTerminalStore(
    (s: { renameTerminal: (id: string, name: string) => void }) => s.renameTerminal,
  );

  const { groupSessions, selectedSession, sessionTabs, sessionsByRecency } =
    useSessionGroupSessions(sessionGroupId, openTabIds, activeSessionId);

  const { handleOpenTerminal, handleCloseTerminal, handleSelectTerminal } = useTerminalActions({
    sessionGroupId,
    terminals,
  });

  const {
    openFiles,
    activeFilePath,
    setActiveFilePath,
    handleFileClick,
    handleDiffFileClick,
    handleSelectFile,
    handleCloseFile,
  } = useFileActions();

  // Fetch full group detail and merge into store
  useEffect(() => {
    client
      .query(SESSION_GROUP_DETAIL_QUERY, { id: sessionGroupId })
      .toPromise()
      .then((result: { data?: Record<string, unknown> }) => {
        if (!result.data?.sessionGroup) return;
        const fetchedGroup = result.data.sessionGroup as SessionGroupEntity & {
          sessions?: unknown[];
        };
        const existingGroup = useEntityStore.getState().sessionGroups[fetchedGroup.id];
        upsert(
          "sessionGroups",
          fetchedGroup.id,
          existingGroup ? { ...existingGroup, ...fetchedGroup } : fetchedGroup,
        );
        const fetchedSessions = fetchedGroup.sessions as
          | Array<Record<string, unknown> & { id: string }>
          | undefined;
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
    if (activeSessionId && sessionsByRecency.some((s: SessionEntity) => s.id === activeSessionId))
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
    if (terminals.some((t) => t.id === activeTerminalId)) return;
    setActiveTerminalId(null);
  }, [activeTerminalId, terminals, setActiveTerminalId]);

  // Auto-restore terminal tabs from server when returning to this session group.
  useEffect(() => {
    let aborted = false;
    const firstSessionId = groupSessions[0]?.id;
    if (!firstSessionId) return;

    const existingGroupTerminals = (
      Object.values(useTerminalStore.getState().terminals) as Array<{ sessionGroupId: string }>
    ).filter((t) => t.sessionGroupId === sessionGroupId);
    if (existingGroupTerminals.length > 0) return;

    client
      .query(SESSION_TERMINALS_QUERY, { sessionId: firstSessionId })
      .toPromise()
      .then((result: { data?: Record<string, unknown> }) => {
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
  }, [groupSessions, sessionGroupId, addTerminal]);
  const selectedSessionIsOptimistic = selectedSession?._optimistic === true;
  const activeTerminal = terminals.find((t) => t.id === activeTerminalId) ?? null;

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
  const canMoveSelectedSession =
    !!selectedSession && !selectedSessionIsOptimistic && selectedSession.sessionStatus !== "merged";
  const linkedCheckoutRepoId =
    groupRepo?.id ?? (selectedSession?.repo as { id: string } | null | undefined)?.id ?? null;
  const linkedCheckoutBranch = groupBranch ?? selectedSession?.branch ?? null;
  const groupRuntimeInstanceId =
    getLinkedCheckoutRuntimeInstanceId(groupConnection) ??
    getLinkedCheckoutRuntimeInstanceId(selectedSession?.connection) ??
    null;
  const selectedSessionRuntimeInstanceId =
    getLinkedCheckoutRuntimeInstanceId(selectedSession?.connection) ??
    getLinkedCheckoutRuntimeInstanceId(groupConnection) ??
    null;
  const { access: bridgeAccess, refresh: refreshBridgeAccess } = useBridgeRuntimeAccess(
    groupRuntimeInstanceId,
    sessionGroupId,
  );
  const { access: selectedSessionBridgeAccess } = useBridgeRuntimeAccess(
    selectedSessionRuntimeInstanceId,
    sessionGroupId,
  );
  const bridgeInteractionAllowed = isBridgeInteractionAllowed(bridgeAccess);
  const selectedSessionBridgeInteractionAllowed = isBridgeInteractionAllowed(
    selectedSessionBridgeAccess,
  );
  const moveMergedDisabled = selectedSession?.sessionStatus === "merged";
  const moveDisabledReason = moveMergedDisabled
    ? "Cannot move a merged session"
    : !selectedSessionBridgeInteractionAllowed
      ? "You don't have access to this bridge"
      : undefined;
  const linkedCheckoutAllowed =
    bridgeInteractionAllowed &&
    !!groupRuntimeInstanceId &&
    (!groupConnection || groupConnection.state !== "disconnected");

  const terminalAllowed = (() => {
    if (!selectedSession) return false;
    const isConnected = !groupConnection || groupConnection.state !== "disconnected";
    return (
      bridgeInteractionAllowed &&
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
    [sessionGroupId, openSessionTab, setActiveSessionId, setActiveTerminalId, setActiveFilePath],
  );

  const handleScrollComplete = useCallback(() => setScrollToEventId(null), []);

  const handleSidebarTabChange = useCallback((tab: SidebarTab) => {
    setSidebarTab(tab);
    if (tab !== "git") setHighlightCheckpointId(null);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setShowSidebar((prev: boolean) => {
      if (prev) setHighlightCheckpointId(null);
      return !prev;
    });
  }, []);

  const handleNewChat = useCallback(async () => {
    if (!selectedSession || selectedSession._optimistic || !bridgeInteractionAllowed) return;
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

    if (result.error) {
      toast.error("Failed to create session", { description: result.error.message });
      return;
    }

    const newSessionId = result.data?.startSession?.id;
    if (!newSessionId) {
      toast.error("Failed to create session");
      return;
    }

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
  }, [
    groupSessions,
    groupBranch,
    bridgeInteractionAllowed,
    groupRepo,
    openSessionTab,
    selectedSession,
    sessionGroupId,
    setActiveSessionId,
  ]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setActiveSessionId(sessionId);
      setActiveTerminalId(null);
      setActiveFilePath(null);
    },
    [setActiveSessionId, setActiveTerminalId, setActiveFilePath],
  );

  const handleCloseSession = useCallback(
    (sessionId: string) => closeSessionTab(sessionGroupId, sessionId),
    [closeSessionTab, sessionGroupId],
  );

  return (
    <CheckpointOpenContext.Provider value={handleOpenCheckpointPanel}>
      <FileOpenContext.Provider value={handleFileClick}>
        <div className="flex h-full flex-col overflow-hidden">
          <GroupHeader
            groupName={groupName as string | undefined}
            sessionGroupId={sessionGroupId}
            repoId={linkedCheckoutRepoId}
            groupBranch={linkedCheckoutBranch}
            linkedCheckoutRuntimeInstanceId={groupRuntimeInstanceId}
            canManageLinkedCheckout={linkedCheckoutAllowed}
            canInteract={bridgeInteractionAllowed}
            selectedSessionStatus={selectedSessionStatus}
            selectedSessionId={selectedSessionIsOptimistic ? null : (selectedSession?.id ?? null)}
            canMoveSession={canMoveSelectedSession && selectedSessionBridgeInteractionAllowed}
            moveDisabledReason={moveDisabledReason}
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
            onOpenTerminal={() => handleOpenTerminal(selectedSession ?? null, terminalAllowed)}
            canNewChat={
              !!selectedSession && !selectedSessionIsOptimistic && bridgeInteractionAllowed
            }
            canOpenTerminal={!selectedSessionIsOptimistic && terminalAllowed}
          />

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <SessionGroupContentArea
                sessionGroupId={sessionGroupId}
                activeFilePath={activeFilePath}
                openFiles={openFiles}
                activeTerminalId={activeTerminal?.id ?? null}
                selectedSession={selectedSession}
                defaultBranch={groupRepo?.defaultBranch ?? "main"}
                scrollToEventId={scrollToEventId}
                onScrollComplete={handleScrollComplete}
              />
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
                  bridgeAccess={bridgeAccess}
                  onBridgeAccessRequested={refreshBridgeAccess}
                />
              </div>
            )}
          </div>
        </div>
      </FileOpenContext.Provider>
    </CheckpointOpenContext.Provider>
  );
}
