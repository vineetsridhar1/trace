import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
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
import { FileCommandPalette } from "./FileCommandPalette";
import { ForkSessionDialog } from "./ForkSessionDialog";
import { SessionGroupContentArea } from "./SessionGroupContentArea";
import { CheckpointOpenContext } from "./CheckpointOpenContext";
import { AttachmentOpenContext, UploadedAttachmentOpenContext } from "./AttachmentOpenContext";
import { FileOpenContext } from "./FileOpenContext";
import { SidebarPanel } from "./SidebarPanel";
import type { SidebarTab } from "./SidebarPanel";
import { SessionApplicationsPanel } from "./applications/SessionApplicationsPanel";
import { isBridgeInteractionAllowed, useBridgeRuntimeAccess } from "./useBridgeRuntimeAccess";
import { useSessionGroupSessions } from "./useSessionGroupSessions";
import { useTerminalActions } from "./useTerminalActions";
import { useFileActions } from "./useFileActions";
import { useSessionGroupFiles } from "./useSessionGroupFiles";
import { useSessionGroupDirectoryTree } from "./useSessionGroupDirectoryTree";
import { getDisplaySessionStatus, isTerminalStatus } from "./sessionStatus";
import { getLinkedCheckoutRuntimeInstanceId } from "../../lib/linked-checkout-access";
import { toast } from "sonner";
import { resolveSupportedHostingForRepo } from "../../lib/repo-capabilities";
import { useRegisterCommands } from "../../hooks/useRegisterCommands";
import type { RegisteredCommand } from "../../stores/command-registry";

const SESSION_SIDEBAR_WIDTH_KEY = "trace:session-sidebar-width";
const DEFAULT_SESSION_SIDEBAR_WIDTH = 300;
const MIN_SESSION_SIDEBAR_WIDTH = 240;
const MAX_SESSION_SIDEBAR_WIDTH = 560;

function clampSessionSidebarWidth(width: number): number {
  return Math.min(MAX_SESSION_SIDEBAR_WIDTH, Math.max(MIN_SESSION_SIDEBAR_WIDTH, width));
}

function getStoredSessionSidebarWidth(): number {
  if (typeof window === "undefined") return DEFAULT_SESSION_SIDEBAR_WIDTH;

  const stored = localStorage.getItem(SESSION_SIDEBAR_WIDTH_KEY);
  if (!stored) return DEFAULT_SESSION_SIDEBAR_WIDTH;

  const parsed = parseInt(stored, 10);
  return Number.isFinite(parsed) ? clampSessionSidebarWidth(parsed) : DEFAULT_SESSION_SIDEBAR_WIDTH;
}

const SESSION_GROUP_DETAIL_QUERY = gql`
  query SessionGroupDetail($id: ID!) {
    sessionGroup(id: $id) {
      id
      name
      kind
      slug
      forkedFromSessionGroupId
      status
      visibility
      owner {
        id
        name
        avatarUrl
      }
      archivedAt
      branch
      prUrl
      workdir
      worktreeDeleted
      worktreeAdopted
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
        remoteUrl
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
        reasoningEffort
        hosting
        branch
        workdir
        worktreeDeleted
        sessionGroupId
        lastUserMessageAt
        lastMessageAt
        inputTokens
        outputTokens
        cacheReadTokens
        cacheCreationTokens
        costUsd
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
          remoteUrl
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
    | { id: string; name: string; remoteUrl?: string | null; defaultBranch?: string }
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
  const groupKind = useEntityField("sessionGroups", sessionGroupId, "kind") as
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
  const setActiveSessionGroupId = useUIStore(
    (s: { setActiveSessionGroupId: (groupId: string | null, sessionId?: string | null) => void }) =>
      s.setActiveSessionGroupId,
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
  const [showApplicationsSidebar, setShowApplicationsSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("files");
  const [sidebarWidth, setSidebarWidth] = useState(() => getStoredSessionSidebarWidth());
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [trafficEndpointId, setTrafficEndpointId] = useState<string | null>(null);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<"session" | "traffic">("session");
  const [highlightCheckpointId, setHighlightCheckpointId] = useState<string | null>(null);
  const [scrollToEventId, setScrollToEventId] = useState<string | null>(null);
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [forkEventId, setForkEventId] = useState<string | null>(null);
  const [filePaletteOpen, setFilePaletteOpen] = useState(false);
  const sidebarResizeCleanupRef = useRef<(() => void) | null>(null);
  const handleOpenForkDialog = useCallback((eventId: string) => {
    setForkEventId(eventId);
    setForkDialogOpen(true);
  }, []);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const renameTerminal = useTerminalStore(
    (s: { renameTerminal: (id: string, name: string) => void }) => s.renameTerminal,
  );

  const { groupSessions, selectedSession, sessionTabs, sessionsByRecency } =
    useSessionGroupSessions(sessionGroupId, openTabIds, activeSessionId);

  const {
    handleOpenTerminal,
    handleCloseTerminal,
    handleSelectTerminal: selectTerminal,
  } = useTerminalActions({
    sessionGroupId,
    terminals,
  });
  const {
    files: sessionGroupFiles,
    loading: sessionGroupFilesLoading,
    error: sessionGroupFilesError,
    refreshFiles,
  } = useSessionGroupFiles(sessionGroupId, filePaletteOpen);
  const {
    tree: sessionGroupFileTree,
    loading: sessionGroupFileTreeLoading,
    error: sessionGroupFileTreeError,
    refreshTree,
    loadDirectory,
  } = useSessionGroupDirectoryTree(sessionGroupId);

  const {
    openFiles,
    activeFilePath,
    setActiveFilePath,
    getFileBuffer,
    setFileBuffer,
    handleFileClick,
    handleDraftAttachmentClick,
    handleUploadedAttachmentClick,
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

  const activeSessionBelongsToGroup = groupSessions.some(
    (session: SessionEntity) => session.id === activeSessionId,
  );
  const initialSessionTabId =
    activeSessionId && activeSessionBelongsToGroup ? activeSessionId : sessionsByRecency[0]?.id;

  // Initialize open tabs with the active deep-linked session when possible.
  useEffect(() => {
    if (!initialSessionTabId) return;
    initSessionTabs(sessionGroupId, [initialSessionTabId]);
  }, [sessionGroupId, initialSessionTabId, initSessionTabs]);

  // Keep URL/history-driven session changes visible in the tab strip.
  useEffect(() => {
    if (activeSessionGroupId !== sessionGroupId) return;
    if (!activeSessionId || !activeSessionBelongsToGroup) return;
    if (openTabIds?.includes(activeSessionId)) return;
    openSessionTab(sessionGroupId, activeSessionId);
  }, [
    activeSessionGroupId,
    activeSessionBelongsToGroup,
    activeSessionId,
    openSessionTab,
    openTabIds,
    sessionGroupId,
  ]);

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
  const showApplicationsSidebarTab = selectedSession?.hosting === "cloud";
  const activeTerminal = terminals.find((t) => t.id === activeTerminalId) ?? null;

  useEffect(() => {
    if (selectedSessionIsOptimistic && showSidebar) {
      setShowSidebar(false);
    }
    if (selectedSessionIsOptimistic && showApplicationsSidebar) {
      setShowApplicationsSidebar(false);
    }
  }, [selectedSessionIsOptimistic, showApplicationsSidebar, showSidebar]);

  useEffect(() => {
    if (!showApplicationsSidebarTab && showApplicationsSidebar) {
      setShowApplicationsSidebar(false);
    }
  }, [showApplicationsSidebar, showApplicationsSidebarTab]);

  useEffect(() => {
    if (groupKind === "app" && showApplicationsSidebarTab && !showApplicationsSidebar) {
      setShowApplicationsSidebar(true);
      setShowSidebar(false);
    }
  }, [groupKind, showApplicationsSidebar, showApplicationsSidebarTab]);

  const selectedSessionStatus = selectedSession
    ? getDisplaySessionStatus(
        selectedSession.sessionStatus,
        groupPrUrl ?? null,
        selectedSession.agentStatus,
        groupArchivedAt ?? null,
      )
    : "in_progress";
  const selectedSessionMergedUnavailable =
    selectedSession?.sessionStatus === "merged" && groupWorktreeDeleted !== false;
  const canMoveSelectedSession =
    !!selectedSession && !selectedSessionIsOptimistic && !selectedSessionMergedUnavailable;
  const linkedCheckoutRepoId =
    groupRepo?.id ?? (selectedSession?.repo as { id: string } | null | undefined)?.id ?? null;
  const linkedCheckoutBranch = groupBranch ?? selectedSession?.branch ?? null;
  const groupRuntimeInstanceId =
    getLinkedCheckoutRuntimeInstanceId(groupConnection) ??
    getLinkedCheckoutRuntimeInstanceId(selectedSession?.connection) ??
    null;
  const groupRuntimeLabel =
    (typeof groupConnection?.runtimeLabel === "string" && groupConnection.runtimeLabel.trim()) ||
    (
      (selectedSession?.connection as { runtimeLabel?: string } | null | undefined)?.runtimeLabel ??
      ""
    ).trim() ||
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
  const moveMergedDisabled = selectedSessionMergedUnavailable;
  const moveDisabledReason = moveMergedDisabled
    ? "Cannot move a merged session"
    : !selectedSessionBridgeInteractionAllowed
      ? "You don't have access to this bridge"
      : undefined;
  const linkedCheckoutAllowed = !!groupRuntimeInstanceId;

  const terminalAllowed = (() => {
    if (!selectedSession) return false;
    const isConnected = !groupConnection || groupConnection.state !== "disconnected";
    return (
      bridgeInteractionAllowed &&
      isConnected &&
      !isTerminalStatus(
        selectedSession.agentStatus,
        selectedSession.sessionStatus,
        groupWorktreeDeleted,
      ) &&
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

  const handleOpenTrafficTab = useCallback(
    (endpointId: string) => {
      setTrafficEndpointId(endpointId);
      setActiveWorkflowTab("traffic");
      setActiveTerminalId(null);
      setActiveFilePath(null);
    },
    [setActiveFilePath, setActiveTerminalId],
  );

  const handleSelectTrafficTab = useCallback(() => {
    if (!trafficEndpointId) return;
    setActiveWorkflowTab("traffic");
    setActiveTerminalId(null);
    setActiveFilePath(null);
  }, [setActiveFilePath, setActiveTerminalId, trafficEndpointId]);

  const handleCloseTrafficTab = useCallback(() => {
    setTrafficEndpointId(null);
    setActiveWorkflowTab("session");
  }, []);

  const handleSelectTerminalTab = useCallback(
    (sessionId: string | null, terminalId: string) => {
      setActiveWorkflowTab("session");
      selectTerminal(sessionId, terminalId);
    },
    [selectTerminal],
  );

  const handleSelectFileTab = useCallback(
    (filePath: string) => {
      setActiveWorkflowTab("session");
      handleSelectFile(filePath);
    },
    [handleSelectFile],
  );

  const handleToggleSidebar = useCallback(() => {
    setShowSidebar((prev: boolean) => {
      if (prev) setHighlightCheckpointId(null);
      const next = !prev;
      if (next) setShowApplicationsSidebar(false);
      return next;
    });
  }, []);

  const handleToggleApplicationsSidebar = useCallback(() => {
    setShowApplicationsSidebar((prev: boolean) => {
      const next = !prev;
      if (next) {
        setShowSidebar(false);
        setHighlightCheckpointId(null);
      }
      return next;
    });
  }, []);

  const handleOpenFilePalette = useCallback(() => {
    setFilePaletteOpen(true);
  }, []);

  const handleToggleFilePalette = useCallback(() => {
    setFilePaletteOpen((open) => !open);
  }, []);

  const handleOpenTerminalCmd = useCallback(() => {
    setActiveWorkflowTab("session");
    void handleOpenTerminal(selectedSession ?? null, terminalAllowed);
  }, [handleOpenTerminal, selectedSession, terminalAllowed]);

  const showSidebarTab = useCallback((tab: SidebarTab) => {
    setShowApplicationsSidebar(false);
    setShowSidebar(true);
    setSidebarTab(tab);
    if (tab !== "git") setHighlightCheckpointId(null);
  }, []);

  const canInteract = !selectedSessionIsOptimistic;
  const canNewChatCmd =
    !!selectedSession && !selectedSessionIsOptimistic && bridgeInteractionAllowed;
  const canOpenTerminalCmd = !selectedSessionIsOptimistic && terminalAllowed;

  const handleSidebarResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      sidebarResizeCleanupRef.current?.();
      const startX = event.clientX;
      const startWidth = sidebarWidth;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      setIsResizingSidebar(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const nextWidth = clampSessionSidebarWidth(startWidth + startX - moveEvent.clientX);
        setSidebarWidth(nextWidth);
      };

      const handleMouseUp = () => {
        sidebarResizeCleanupRef.current?.();
        setIsResizingSidebar(false);
        setSidebarWidth((width) => {
          localStorage.setItem(SESSION_SIDEBAR_WIDTH_KEY, String(width));
          return width;
        });
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      sidebarResizeCleanupRef.current = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        sidebarResizeCleanupRef.current = null;
      };
    },
    [sidebarWidth],
  );

  useEffect(() => {
    return () => sidebarResizeCleanupRef.current?.();
  }, []);

  const handleNewChat = useCallback(async () => {
    if (!selectedSession || selectedSession._optimistic || !bridgeInteractionAllowed) return null;
    const resolvedChannelId =
      getSessionGroupChannelId(
        useEntityStore.getState().sessionGroups[sessionGroupId] ?? null,
        groupSessions,
      ) ?? getSessionChannelId(selectedSession);
    const selectedRepo =
      groupRepo ??
      (selectedSession.repo as { id: string; remoteUrl?: string | null } | null | undefined);
    const selectedHosting = resolveSupportedHostingForRepo(selectedSession.hosting, selectedRepo);
    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: {
          tool: selectedSession.tool,
          model: selectedSession.model ?? undefined,
          reasoningEffort: selectedSession.reasoningEffort ?? undefined,
          hosting: selectedHosting,
          channelId: resolvedChannelId ?? undefined,
          repoId: selectedRepo?.id,
          branch: groupBranch ?? selectedSession.branch ?? undefined,
          sessionGroupId,
        },
      })
      .toPromise();

    if (result.error) {
      toast.error("Failed to create session", { description: result.error.message });
      return null;
    }

    const newSessionId = result.data?.startSession?.id;
    if (!newSessionId) {
      toast.error("Failed to create session");
      return null;
    }

    optimisticallyInsertSession({
      id: newSessionId,
      sessionGroupId,
      tool: selectedSession.tool,
      model: selectedSession.model,
      reasoningEffort: selectedSession.reasoningEffort,
      hosting: selectedHosting ?? selectedSession.hosting,
      channel: resolvedChannelId ? { id: resolvedChannelId } : null,
      repo: selectedRepo,
      branch: groupBranch ?? selectedSession.branch,
    });
    openSessionTab(sessionGroupId, newSessionId);
    setActiveSessionId(newSessionId);
    return newSessionId;
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

  // Close whatever tab is currently shown. Files/terminals/traffic reveal the
  // session beneath them; closing the last session tab returns to the table.
  const handleCloseCurrentTab = useCallback(() => {
    if (activeWorkflowTab === "traffic" && trafficEndpointId) {
      handleCloseTrafficTab();
      return;
    }
    if (activeFilePath) {
      handleCloseFile(activeFilePath);
      return;
    }
    if (activeTerminalId) {
      handleCloseTerminal(activeTerminalId);
      return;
    }
    if (activeSessionId && (openTabIds?.length ?? 0) > 1) {
      closeSessionTab(sessionGroupId, activeSessionId);
      return;
    }
    setActiveSessionGroupId(null);
  }, [
    activeWorkflowTab,
    trafficEndpointId,
    activeFilePath,
    activeTerminalId,
    activeSessionId,
    openTabIds,
    handleCloseTrafficTab,
    handleCloseFile,
    handleCloseTerminal,
    closeSessionTab,
    sessionGroupId,
    setActiveSessionGroupId,
  ]);

  const sessionCommands = useMemo<RegisteredCommand[]>(() => {
    const commands: RegisteredCommand[] = [
      {
        id: "session.close-tab",
        title: "Close tab",
        group: "Session",
        keywords: "close tab session terminal file",
        run: handleCloseCurrentTab,
        shortcut: { key: "w", mod: true },
      },
      {
        id: "session.find-file",
        title: "Find file",
        group: "Session",
        keywords: "open file search palette",
        run: handleToggleFilePalette,
        shortcut: { key: "p", mod: true },
      },
    ];
    if (canInteract) {
      commands.push(
        {
          id: "session.toggle-sidebar",
          title: "Toggle session sidebar",
          group: "Session",
          keywords: "files git changes panel info",
          run: handleToggleSidebar,
          shortcut: { key: "e", mod: true, shift: true },
        },
        {
          id: "session.show-files",
          title: "Show files",
          group: "Session",
          keywords: "file tree explorer sidebar",
          run: () => showSidebarTab("files"),
        },
        {
          id: "session.show-git",
          title: "Show git",
          group: "Session",
          keywords: "git checkpoints history sidebar",
          run: () => showSidebarTab("git"),
        },
        {
          id: "session.show-changes",
          title: "Show changes",
          group: "Session",
          keywords: "diff changes review sidebar",
          run: () => showSidebarTab("changes"),
        },
      );
      // Applications panel only exists for cloud-hosted sessions; registering it
      // otherwise would open a panel an effect immediately closes again.
      if (showApplicationsSidebarTab) {
        commands.push({
          id: "session.toggle-applications",
          title: "Toggle applications panel",
          group: "Session",
          keywords: "apps processes ports traffic",
          run: handleToggleApplicationsSidebar,
        });
      }
    }
    if (canNewChatCmd) {
      commands.push({
        id: "session.new-chat",
        title: "New chat in session group",
        group: "Session",
        keywords: "new chat session conversation",
        run: () => void handleNewChat(),
      });
    }
    if (canOpenTerminalCmd) {
      commands.push({
        id: "session.new-terminal",
        title: "New terminal",
        group: "Session",
        keywords: "terminal shell console",
        run: handleOpenTerminalCmd,
        shortcut: { key: "j", mod: true },
      });
    }
    return commands;
  }, [
    canInteract,
    canNewChatCmd,
    canOpenTerminalCmd,
    showApplicationsSidebarTab,
    handleCloseCurrentTab,
    handleToggleFilePalette,
    handleToggleSidebar,
    handleToggleApplicationsSidebar,
    showSidebarTab,
    handleNewChat,
    handleOpenTerminalCmd,
  ]);

  useRegisterCommands(sessionCommands);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setActiveWorkflowTab("session");
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
        <AttachmentOpenContext.Provider value={handleDraftAttachmentClick}>
          <UploadedAttachmentOpenContext.Provider value={handleUploadedAttachmentClick}>
            <div className="flex h-full flex-col overflow-hidden">
              <GroupHeader
                groupName={groupName as string | undefined}
                sessionGroupId={sessionGroupId}
                repoId={linkedCheckoutRepoId}
                groupBranch={linkedCheckoutBranch}
                linkedCheckoutRuntimeLabel={groupRuntimeLabel}
                linkedCheckoutRuntimeInstanceId={groupRuntimeInstanceId}
                canManageLinkedCheckout={linkedCheckoutAllowed}
                canInteract={bridgeInteractionAllowed}
                selectedSessionStatus={selectedSessionStatus}
                selectedSessionId={
                  selectedSessionIsOptimistic ? null : (selectedSession?.id ?? null)
                }
                selectedAgentStatus={selectedSession?.agentStatus}
                selectedHosting={selectedSession?.hosting}
                selectedConnection={
                  selectedSession?.connection as Record<string, unknown> | null | undefined
                }
                selectedWorktreeDeleted={selectedSession?.worktreeDeleted}
                canMoveSession={canMoveSelectedSession && selectedSessionBridgeInteractionAllowed}
                moveDisabledReason={moveDisabledReason}
                groupPrUrl={groupPrUrl}
                panelMode={panelMode}
                isFullscreen={isFullscreen}
                showSidebar={showSidebar}
                showApplicationsSidebar={showApplicationsSidebar}
                canShowApplications={showApplicationsSidebarTab}
                onToggleFullscreen={toggleFullscreen}
                onToggleSidebar={selectedSessionIsOptimistic ? () => {} : handleToggleSidebar}
                onToggleApplicationsSidebar={
                  selectedSessionIsOptimistic ? () => {} : handleToggleApplicationsSidebar
                }
              />

              <GroupTabStrip
                sessionTabs={sessionTabs}
                terminals={terminals}
                groupSessions={groupSessions}
                selectedSessionId={selectedSession?.id ?? null}
                activeTerminalId={activeTerminalId}
                openFiles={openFiles}
                activeFilePath={activeFilePath}
                trafficTabOpen={trafficEndpointId !== null}
                trafficTabActive={activeWorkflowTab === "traffic" && trafficEndpointId !== null}
                onSelectSession={handleSelectSession}
                onCloseSession={handleCloseSession}
                canCloseSessions={false}
                onSelectTerminal={handleSelectTerminalTab}
                onCloseTerminal={handleCloseTerminal}
                onRenameTerminal={renameTerminal}
                onSelectFile={handleSelectFileTab}
                onCloseFile={handleCloseFile}
                onSelectTraffic={handleSelectTrafficTab}
                onCloseTraffic={handleCloseTrafficTab}
                onNewChat={handleNewChat}
                onOpenTerminal={() => {
                  setActiveWorkflowTab("session");
                  void handleOpenTerminal(selectedSession ?? null, terminalAllowed);
                }}
                onOpenFilePalette={handleOpenFilePalette}
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
                    activeTrafficEndpointId={
                      activeWorkflowTab === "traffic" ? trafficEndpointId : null
                    }
                    selectedSession={selectedSession}
                    sessionsByRecency={sessionsByRecency}
                    canStartNewChat={
                      !!selectedSession && !selectedSessionIsOptimistic && bridgeInteractionAllowed
                    }
                    onStartNewChat={handleNewChat}
                    defaultBranch={groupRepo?.defaultBranch ?? "main"}
                    getFileBuffer={getFileBuffer}
                    setFileBuffer={setFileBuffer}
                    scrollToEventId={scrollToEventId}
                    onScrollComplete={handleScrollComplete}
                    onForkSession={handleOpenForkDialog}
                    canForkSession={!!selectedSession && !selectedSessionIsOptimistic}
                  />
                </div>
                {(showSidebar || showApplicationsSidebar) && !selectedSessionIsOptimistic && (
                  <div
                    className={`relative h-full shrink-0 border-l border-[#2d2d2d] ${
                      isResizingSidebar ? "" : "transition-[width] duration-150 ease-in-out"
                    }`}
                    style={{ width: sidebarWidth }}
                  >
                    <div
                      onMouseDown={handleSidebarResizeStart}
                      className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize hover:bg-ring active:bg-ring"
                    />
                    {showApplicationsSidebar ? (
                      <SessionApplicationsPanel
                        sessionGroupId={sessionGroupId}
                        onOpenTraffic={handleOpenTrafficTab}
                      />
                    ) : (
                      <SidebarPanel
                        sessionGroupId={sessionGroupId}
                        activeSessionId={selectedSession?.id ?? null}
                        activeTab={sidebarTab}
                        fileTree={sessionGroupFileTree}
                        filesLoading={sessionGroupFileTreeLoading}
                        filesError={sessionGroupFileTreeError}
                        onTabChange={handleSidebarTabChange}
                        onFileClick={handleFileClick}
                        onRefreshFiles={refreshTree}
                        onLoadDirectory={loadDirectory}
                        onDiffFileClick={handleDiffFileClick}
                        highlightCheckpointId={highlightCheckpointId}
                        onCheckpointClick={handleCheckpointClick}
                        bridgeAccess={bridgeAccess}
                        onBridgeAccessRequested={refreshBridgeAccess}
                      />
                    )}
                  </div>
                )}
              </div>
              <ForkSessionDialog
                eventId={selectedSessionIsOptimistic ? null : forkEventId}
                sessionName={selectedSession?.name ?? "this session"}
                open={forkDialogOpen}
                onOpenChange={setForkDialogOpen}
              />
              <FileCommandPalette
                open={filePaletteOpen}
                files={sessionGroupFiles}
                loading={sessionGroupFilesLoading}
                error={sessionGroupFilesError}
                onOpenChange={setFilePaletteOpen}
                onRefresh={refreshFiles}
                onOpenFile={handleFileClick}
              />
            </div>
          </UploadedAttachmentOpenContext.Provider>
        </AttachmentOpenContext.Provider>
      </FileOpenContext.Provider>
    </CheckpointOpenContext.Provider>
  );
}
