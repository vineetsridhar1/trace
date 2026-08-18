import { useCallback, useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";
import {
  DESTROY_TERMINAL_MUTATION,
  mergeSessionGroupEntity,
  SESSION_TERMINALS_QUERY,
  START_SESSION_MUTATION,
} from "@trace/client-core";
import type { Terminal } from "@trace/gql";
import { useDetailPanelStore } from "../../stores/detail-panel";
import { useEntityField, useEntityStore } from "@trace/client-core";
import type { SessionEntity, SessionGroupEntity } from "@trace/client-core";
import { useTerminalStore, useSessionGroupTerminals } from "../../stores/terminal";
import { useUIStore, type UIState } from "../../stores/ui";
import { useWorkspaceSidebarStore } from "../../stores/workspace-sidebar";
import { getSessionChannelId, getSessionGroupChannelId } from "@trace/client-core";
import { optimisticallyInsertSession } from "../../lib/optimistic-session";
import { GroupHeader } from "./GroupHeader";
import { FileCommandPalette } from "./FileCommandPalette";
import { ForkSessionDialog } from "./ForkSessionDialog";
import { SessionGroupContentArea } from "./SessionGroupContentArea";
import { AppSessionWorkspace } from "./AppSessionWorkspace";
import { AttachmentOpenContext, UploadedAttachmentOpenContext } from "./AttachmentOpenContext";
import { FileOpenContext } from "./FileOpenContext";
import { WorkspaceSurfaceContent } from "./SidebarPanel";
import { SpatialWorkspace } from "./SpatialWorkspace";
import { SpatialNewTab, type SpatialNewChatInput } from "./SpatialNewTab";
import { AppSessionPreviewPanel } from "./applications/AppSessionPreviewPanel";
import { isBridgeInteractionAllowed, useBridgeRuntimeAccess } from "./useBridgeRuntimeAccess";
import { useSessionGroupSessions } from "./useSessionGroupSessions";
import { useTerminalActions } from "./useTerminalActions";
import { useFileActions } from "./useFileActions";
import { useSessionGroupFiles } from "./useSessionGroupFiles";
import { useSessionGroupDirectoryTree } from "./useSessionGroupDirectoryTree";
import {
  getSessionGroupAgentStatus,
  getSessionGroupDisplayStatus,
  isTerminalStatus,
} from "./sessionStatus";
import { isAppCanvasReady } from "./app-session-readiness";
import { getLinkedCheckoutRuntimeInstanceId } from "../../lib/linked-checkout-access";
import { toast } from "sonner";
import {
  CLOUD_REPO_REMOTE_REQUIRED,
  repoRemoteKnownMissing,
  resolveSupportedHostingForRepo,
} from "../../lib/repo-capabilities";
import { useRegisterCommands } from "../../hooks/useRegisterCommands";
import type { RegisteredCommand } from "../../stores/command-registry";
import { ArtifactOpenContext } from "../artifact/ArtifactOpenContext";
import { ArtifactTabContent } from "../artifact/ArtifactTabContent";
import { useWorkspaceTabRequests } from "./useWorkspaceTabRequests";
import { useWorkspaceNewTabActions } from "./useWorkspaceNewTabActions";
import { APP_CANVAS_TAB_ID, useSessionWorkspaceTabs } from "./useSessionWorkspaceTabs";

const EMPTY_ARTIFACT_IDS: string[] = [];
const EMPTY_HIDDEN_SESSION_TABS: Record<string, string> = {};
const HIDDEN_SESSION_TABS_QUERY = gql`
  query HiddenSessionTabs($sessionGroupId: ID!) {
    hiddenSessionTabs(sessionGroupId: $sessionGroupId) {
      sessionId
      hiddenAt
    }
  }
`;

const HIDE_SESSION_TAB_MUTATION = gql`
  mutation HideSessionTab($sessionId: ID!) {
    hideSessionTab(sessionId: $sessionId) {
      sessionId
      hiddenAt
    }
  }
`;

const RESTORE_SESSION_TAB_MUTATION = gql`
  mutation RestoreSessionTab($sessionId: ID!) {
    restoreSessionTab(sessionId: $sessionId)
  }
`;

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
  const hiddenSessionTabs = useUIStore(
    (s: { hiddenSessionTabsByGroup: Record<string, Record<string, string>> }) =>
      s.hiddenSessionTabsByGroup[sessionGroupId] ?? EMPTY_HIDDEN_SESSION_TABS,
  );
  const setHiddenSessionTabs = useUIStore(
    (s: { setHiddenSessionTabs: UIState["setHiddenSessionTabs"] }) => s.setHiddenSessionTabs,
  );
  const openSessionTab = useUIStore(
    (s: { openSessionTab: (groupId: string, sessionId: string) => void }) => s.openSessionTab,
  );
  const initSessionTabs = useUIStore(
    (s: { initSessionTabs: (groupId: string, sessionIds: string[]) => void }) => s.initSessionTabs,
  );
  const openArtifactIds = useUIStore(
    (s: { openArtifactTabsByGroup: Record<string, string[]> }) =>
      s.openArtifactTabsByGroup[sessionGroupId] ?? EMPTY_ARTIFACT_IDS,
  );
  const activeArtifactId = useUIStore(
    (s: { activeArtifactIdsByGroup: Record<string, string | null> }) =>
      s.activeArtifactIdsByGroup[sessionGroupId] ?? null,
  );
  const openArtifactTab = useUIStore(
    (s: { openArtifactTab: (groupId: string, artifactId: string) => void }) => s.openArtifactTab,
  );
  const closeArtifactTab = useUIStore(
    (s: { closeArtifactTab: (groupId: string, artifactId: string) => void }) => s.closeArtifactTab,
  );
  const setGroupActiveArtifactId = useUIStore(
    (s: { setActiveArtifactId: (groupId: string, artifactId: string | null) => void }) =>
      s.setActiveArtifactId,
  );
  const setActiveArtifactId = useCallback(
    (artifactId: string | null) => setGroupActiveArtifactId(sessionGroupId, artifactId),
    [sessionGroupId, setGroupActiveArtifactId],
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
  const filesSidebarOpen = useWorkspaceSidebarStore(
    (state) => state.filesSessionGroupId === sessionGroupId,
  );
  const openFilesSidebar = useWorkspaceSidebarStore((state) => state.openFiles);
  const toggleFilesSidebar = useWorkspaceSidebarStore((state) => state.toggleFiles);
  const sidebarFileOpenRequest = useWorkspaceSidebarStore((state) => state.fileOpenRequest);
  const consumeSidebarFileOpenRequest = useWorkspaceSidebarStore(
    (state) => state.consumeFileOpenRequest,
  );

  const [trafficEndpointId, setTrafficEndpointId] = useState<string | null>(null);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<"session" | "traffic">("session");
  const [scrollToEventId, setScrollToEventId] = useState<string | null>(null);
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [forkEventId, setForkEventId] = useState<string | null>(null);
  const [filePaletteOpen, setFilePaletteOpen] = useState(false);
  const [groupLoadError, setGroupLoadError] = useState<string | null>(null);
  const {
    browserTitles,
    draftTabs: draftWorkspaceTabs,
    foregroundTabId: requestedActiveWorkspaceTabId,
    handleBrowserTitleChange,
    setDraftTabs: setDraftWorkspaceTabs,
    setForegroundTabId: setRequestedActiveWorkspaceTabId,
    tabReplacements: workspaceTabReplacements,
    handleTabReplacementsApplied,
  } = useWorkspaceTabRequests({
    sessionGroupId,
    setActiveSessionId,
    setActiveTerminalId,
  });
  const workspaceTerminals = terminals;

  const handleOpenForkDialog = useCallback((eventId: string) => {
    setForkEventId(eventId);
    setForkDialogOpen(true);
  }, []);
  const addTerminal = useTerminalStore((s) => s.addTerminal);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);

  const hiddenSessionIds = useMemo(
    () => new Set(Object.keys(hiddenSessionTabs)),
    [hiddenSessionTabs],
  );
  const { groupSessions, selectedSession, sessionTabs, sessionsByRecency } =
    useSessionGroupSessions(sessionGroupId, openTabIds, activeSessionId, hiddenSessionIds);
  const closedSessions = useMemo(
    () => groupSessions.filter((session) => hiddenSessionIds.has(session.id)),
    [groupSessions, hiddenSessionIds],
  );

  useEffect(() => {
    void client
      .query(HIDDEN_SESSION_TABS_QUERY, { sessionGroupId }, { requestPolicy: "network-only" })
      .toPromise()
      .then((result) => {
        const tabs = (
          result.data as
            | { hiddenSessionTabs?: Array<{ sessionId: string; hiddenAt: string }> }
            | undefined
        )?.hiddenSessionTabs;
        if (tabs) setHiddenSessionTabs(sessionGroupId, tabs);
      });
  }, [sessionGroupId, setHiddenSessionTabs]);

  const {
    handleOpenTerminal,
    handleCreateTerminal,
    handleSelectTerminal: selectTerminal,
  } = useTerminalActions({ sessionGroupId, terminals });
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

  useEffect(() => {
    if (!sidebarFileOpenRequest || sidebarFileOpenRequest.sessionGroupId !== sessionGroupId) return;
    if (sidebarFileOpenRequest.kind === "diff") {
      handleDiffFileClick(
        sidebarFileOpenRequest.filePath,
        sidebarFileOpenRequest.status ?? "modified",
      );
    } else {
      handleFileClick(sidebarFileOpenRequest.filePath);
    }
    consumeSidebarFileOpenRequest(sidebarFileOpenRequest.id);
  }, [
    consumeSidebarFileOpenRequest,
    handleDiffFileClick,
    handleFileClick,
    sessionGroupId,
    sidebarFileOpenRequest,
  ]);

  const handleCloseArtifact = useCallback(
    (artifactId: string) => closeArtifactTab(sessionGroupId, artifactId),
    [closeArtifactTab, sessionGroupId],
  );

  useEffect(() => {
    if (activeFilePath || activeTerminalId || activeWorkflowTab === "traffic") {
      setActiveArtifactId(null);
    }
  }, [activeFilePath, activeTerminalId, activeWorkflowTab, setActiveArtifactId]);

  // Fetch full group detail and merge into store
  useEffect(() => {
    setGroupLoadError(null);
    void client
      .query(SESSION_GROUP_DETAIL_QUERY, { id: sessionGroupId }, { requestPolicy: "network-only" })
      .toPromise()
      .then((result: { data?: Record<string, unknown>; error?: { message?: string } }) => {
        if (!result.data?.sessionGroup) {
          setGroupLoadError(result.error?.message ?? "This shared project could not be found.");
          return;
        }
        const fetchedGroup = result.data.sessionGroup as SessionGroupEntity & {
          sessions?: unknown[];
        };
        const existingGroup = useEntityStore.getState().sessionGroups[fetchedGroup.id];
        upsert(
          "sessionGroups",
          fetchedGroup.id,
          mergeSessionGroupEntity(existingGroup, fetchedGroup),
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
      })
      .catch(() => setGroupLoadError("Unable to load this shared project. Please try again."));
  }, [sessionGroupId, upsert, upsertMany]);

  // Auto-select the most recent session if none is selected
  useEffect(() => {
    if (activeSessionGroupId !== sessionGroupId) return;
    if (sessionTabs.length === 0) return;
    if (activeSessionId && sessionTabs.some((s: SessionEntity) => s.id === activeSessionId)) return;
    setActiveSessionId(sessionTabs[0].id);
  }, [activeSessionGroupId, activeSessionId, sessionGroupId, sessionTabs, setActiveSessionId]);

  const activeSessionBelongsToGroup = groupSessions.some(
    (session: SessionEntity) => session.id === activeSessionId,
  );
  const initialSessionTabId =
    activeSessionId && activeSessionBelongsToGroup ? activeSessionId : sessionTabs[0]?.id;

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

  // Restore terminals which predate this view. Subsequent lifecycle changes
  // arrive through the organization event stream.
  useEffect(() => {
    let aborted = false;
    const firstSessionId = groupSessions[0]?.id;
    if (!firstSessionId) return;

    const existingGroupTerminals = (
      Object.values(useTerminalStore.getState().terminals) as Array<{ sessionGroupId: string }>
    ).filter((t) => t.sessionGroupId === sessionGroupId);
    if (existingGroupTerminals.length > 0) return;

    void client
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
  const isAppGroup = groupKind === "app";
  const selectedConnection = selectedSession?.connection as
    | Record<string, unknown>
    | null
    | undefined;
  const appCanvasReady = isAppCanvasReady(
    selectedSession?.agentStatus,
    selectedConnection?.state,
    groupConnection?.state,
  );
  const showApplicationsSidebarTab = selectedSession?.hosting === "cloud";

  const selectedSessionStatus = getSessionGroupDisplayStatus(
    groupSessions.map((session) => session.sessionStatus),
    groupArchivedAt ?? null,
    groupPrUrl,
  );
  const displayAgentStatus = getSessionGroupAgentStatus(
    groupSessions.map((session) => session.agentStatus),
    groupSessions,
  );
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

  const handleScrollComplete = useCallback(() => setScrollToEventId(null), []);

  const handleOpenTrafficTab = useCallback(
    (endpointId: string) => {
      setTrafficEndpointId(endpointId);
      setActiveWorkflowTab("traffic");
      setActiveTerminalId(null);
      setActiveFilePath(null);
      setActiveArtifactId(null);
    },
    [setActiveArtifactId, setActiveFilePath, setActiveTerminalId],
  );

  const handleSelectTrafficTab = useCallback(() => {
    if (!trafficEndpointId) return;
    setActiveWorkflowTab("traffic");
    setActiveTerminalId(null);
    setActiveFilePath(null);
    setActiveArtifactId(null);
  }, [setActiveArtifactId, setActiveFilePath, setActiveTerminalId, trafficEndpointId]);

  const handleCloseTrafficTab = useCallback(() => {
    setTrafficEndpointId(null);
    setActiveWorkflowTab("session");
  }, []);

  const handleSelectTerminalTab = useCallback(
    (sessionId: string | null, terminalId: string) => {
      setActiveWorkflowTab("session");
      setActiveArtifactId(null);
      setActiveFilePath(null);
      selectTerminal(sessionId, terminalId);
    },
    [selectTerminal, setActiveArtifactId, setActiveFilePath],
  );

  const handleSelectFileTab = useCallback(
    (filePath: string) => {
      setActiveWorkflowTab("session");
      setActiveArtifactId(null);
      handleSelectFile(filePath);
    },
    [handleSelectFile, setActiveArtifactId],
  );

  const handleCloseTerminal = useCallback(
    (terminalId: string) => {
      removeTerminal(terminalId);
      if (activeTerminalId === terminalId) setActiveTerminalId(null);
      void client.mutation(DESTROY_TERMINAL_MUTATION, { terminalId }).toPromise();
    },
    [activeTerminalId, removeTerminal, setActiveTerminalId],
  );

  const handleToggleFilePalette = useCallback(() => {
    setFilePaletteOpen((open) => !open);
  }, []);

  const handleOpenTerminalCmd = useCallback(() => {
    setActiveWorkflowTab("session");
    setActiveArtifactId(null);
    setActiveFilePath(null);
    void handleOpenTerminal(selectedSession ?? null, terminalAllowed);
  }, [
    handleOpenTerminal,
    selectedSession,
    setActiveArtifactId,
    setActiveFilePath,
    terminalAllowed,
  ]);

  const canNewChatCmd =
    !!selectedSession && !selectedSessionIsOptimistic && bridgeInteractionAllowed;
  const canOpenTerminalCmd = !selectedSessionIsOptimistic && terminalAllowed;

  const handleNewChat = useCallback(
    async (input?: Partial<SpatialNewChatInput>) => {
      if (!selectedSession || selectedSession._optimistic || !bridgeInteractionAllowed) return null;
      const resolvedChannelId =
        getSessionGroupChannelId(
          useEntityStore.getState().sessionGroups[sessionGroupId] ?? null,
          groupSessions,
        ) ?? getSessionChannelId(selectedSession);
      const selectedRepo =
        groupRepo ??
        (selectedSession.repo as { id: string; remoteUrl?: string | null } | null | undefined);
      if (selectedSession.hosting === "cloud" && repoRemoteKnownMissing(selectedRepo)) {
        toast.error("Cloud is unavailable for this repo", {
          description: CLOUD_REPO_REMOTE_REQUIRED,
        });
        return null;
      }
      const selectedHosting = resolveSupportedHostingForRepo(selectedSession.hosting, selectedRepo);
      const nextTool = input?.tool ?? selectedSession.tool;
      const nextModel = input?.model === undefined ? selectedSession.model : input.model;
      const nextReasoningEffort =
        input?.reasoningEffort === undefined
          ? selectedSession.reasoningEffort
          : input.reasoningEffort;
      const result = await client
        .mutation(START_SESSION_MUTATION, {
          input: {
            tool: nextTool,
            model: nextModel ?? undefined,
            reasoningEffort: nextReasoningEffort ?? undefined,
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
        tool: nextTool,
        model: nextModel,
        reasoningEffort: nextReasoningEffort,
        hosting: selectedHosting ?? selectedSession.hosting,
        channel: resolvedChannelId ? { id: resolvedChannelId } : null,
        repo: selectedRepo,
        branch: groupBranch ?? selectedSession.branch,
      });
      openSessionTab(sessionGroupId, newSessionId);
      setActiveSessionId(newSessionId);
      setActiveArtifactId(null);
      return newSessionId;
    },
    [
      groupSessions,
      groupBranch,
      bridgeInteractionAllowed,
      groupRepo,
      openSessionTab,
      selectedSession,
      sessionGroupId,
      setActiveArtifactId,
      setActiveSessionId,
    ],
  );

  // Close whatever tab is currently shown. Files/terminals/traffic reveal the
  // session beneath them; closing the last session tab returns to the table.
  const handleCloseCurrentTab = useCallback(() => {
    if (activeArtifactId) {
      handleCloseArtifact(activeArtifactId);
      return;
    }
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
    if (activeSessionId) {
      void client.mutation(HIDE_SESSION_TAB_MUTATION, { sessionId: activeSessionId }).toPromise();
      return;
    }
    setActiveSessionGroupId(null);
  }, [
    activeWorkflowTab,
    activeArtifactId,
    trafficEndpointId,
    activeFilePath,
    activeTerminalId,
    activeSessionId,
    handleCloseTrafficTab,
    handleCloseArtifact,
    handleCloseFile,
    handleCloseTerminal,
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
    canNewChatCmd,
    canOpenTerminalCmd,
    handleCloseCurrentTab,
    handleToggleFilePalette,
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
      setActiveArtifactId(null);
    },
    [setActiveArtifactId, setActiveSessionId, setActiveTerminalId, setActiveFilePath],
  );

  const handleCloseSession = useCallback((sessionId: string) => {
    void client.mutation(HIDE_SESSION_TAB_MUTATION, { sessionId }).toPromise();
  }, []);

  const handleRestoreSession = useCallback(
    (sessionId: string) => {
      // The session_tab_restored event clears the hidden entry; without the
      // mutation the tab would reappear locally and be hidden again on reload.
      void client.mutation(RESTORE_SESSION_TAB_MUTATION, { sessionId }).toPromise();
      openSessionTab(sessionGroupId, sessionId);
      handleSelectSession(sessionId);
    },
    [handleSelectSession, openSessionTab, sessionGroupId],
  );

  const handleOpenArtifact = useCallback(
    (artifactId: string) => {
      openArtifactTab(sessionGroupId, artifactId);
      setActiveWorkflowTab("session");
      setActiveTerminalId(null);
      setActiveFilePath(null);
    },
    [openArtifactTab, sessionGroupId, setActiveFilePath, setActiveTerminalId],
  );

  const handleSelectArtifact = useCallback(
    (artifactId: string) => {
      setActiveArtifactId(artifactId);
      setActiveWorkflowTab("session");
      setActiveTerminalId(null);
      setActiveFilePath(null);
    },
    [setActiveArtifactId, setActiveFilePath, setActiveTerminalId],
  );

  const workspaceTabs = useSessionWorkspaceTabs({
    sessions: sessionTabs,
    artifactIds: openArtifactIds,
    terminals: workspaceTerminals,
    files: openFiles,
    drafts: draftWorkspaceTabs,
    browserTitles,
    trafficEndpointId,
    appCanvas: isAppGroup,
  });

  // Explicitly opened surfaces still win, but an app group with nothing else
  // open lands on its canvas rather than on the chat tab.
  const preferredWorkspaceTabId = activeArtifactId
    ? `artifact:${activeArtifactId}`
    : activeFilePath
      ? `file:${activeFilePath}`
      : activeTerminalId
        ? `terminal:${activeTerminalId}`
        : activeWorkflowTab === "traffic" && trafficEndpointId
          ? "traffic"
          : isAppGroup
            ? APP_CANVAS_TAB_ID
            : selectedSession
              ? `session:${selectedSession.id}`
              : (draftWorkspaceTabs[0]?.id ?? null);

  const handleActivateWorkspaceTab = useCallback(
    (tabId: string) => {
      if (tabId.startsWith("session:")) {
        handleSelectSession(tabId.slice("session:".length));
      } else if (tabId.startsWith("artifact:")) {
        handleSelectArtifact(tabId.slice("artifact:".length));
      } else if (tabId.startsWith("terminal:")) {
        const terminalId = tabId.slice("terminal:".length);
        const terminal = workspaceTerminals.find((candidate) => candidate.id === terminalId);
        handleSelectTerminalTab(terminal?.sessionId ?? null, terminalId);
      } else if (tabId.startsWith("file:")) {
        handleSelectFileTab(tabId.slice("file:".length));
      } else if (tabId === "traffic") {
        handleSelectTrafficTab();
      }
    },
    [
      handleSelectArtifact,
      handleSelectFileTab,
      handleSelectSession,
      handleSelectTerminalTab,
      handleSelectTrafficTab,
      workspaceTerminals,
    ],
  );

  const handleCloseWorkspaceTab = useCallback(
    (tabId: string) => {
      if (tabId.startsWith("draft:")) {
        const draft = draftWorkspaceTabs.find((candidate) => candidate.id === tabId);
        if (draft?.surface === "browser") {
          void window.trace?.destroyBrowser({ sessionGroupId, browserId: tabId });
        }
        setDraftWorkspaceTabs((drafts) => drafts.filter((draft) => draft.id !== tabId));
      } else if (tabId.startsWith("session:")) {
        handleCloseSession(tabId.slice("session:".length));
      } else if (tabId.startsWith("artifact:")) {
        handleCloseArtifact(tabId.slice("artifact:".length));
      } else if (tabId.startsWith("terminal:")) {
        handleCloseTerminal(tabId.slice("terminal:".length));
      } else if (tabId.startsWith("file:")) {
        handleCloseFile(tabId.slice("file:".length));
      } else if (tabId === "traffic") {
        handleCloseTrafficTab();
      }
    },
    [
      handleCloseArtifact,
      handleCloseFile,
      handleCloseTerminal,
      handleCloseSession,
      handleCloseTrafficTab,
      draftWorkspaceTabs,
      sessionGroupId,
    ],
  );

  const handleNewWorkspaceTab = useCallback(() => {
    const id = `draft:${crypto.randomUUID()}`;
    setDraftWorkspaceTabs((drafts) => [...drafts, { id, surface: null }]);
    return id;
  }, []);

  const handleWorkspaceOverlayVisibility = useCallback(
    (visible: boolean) => {
      for (const draft of draftWorkspaceTabs) {
        if (draft.surface !== "browser") continue;
        void window.trace?.setBrowserOverlayHidden({
          sessionGroupId,
          browserId: draft.id,
          hidden: visible,
        });
      }
    },
    [draftWorkspaceTabs, sessionGroupId],
  );

  const { convertTab, startChatInTab } = useWorkspaceNewTabActions({
    sessionGroupId,
    selectedSession: selectedSession ?? null,
    terminalAllowed,
    setDraftTabs: setDraftWorkspaceTabs,
    setForegroundTabId: setRequestedActiveWorkspaceTabId,
    openFilesSidebar,
    createTerminal: handleCreateTerminal,
    startChat: handleNewChat,
  });

  const renderWorkspaceTab = useCallback(
    (tabId: string) => {
      if (tabId.startsWith("draft:")) {
        const draft = draftWorkspaceTabs.find((candidate) => candidate.id === tabId);
        if (draft?.surface) {
          return (
            <WorkspaceSurfaceContent
              sessionGroupId={sessionGroupId}
              browserId={tabId}
              browserInitialUrl={draft.initialUrl}
              surface={draft.surface}
              activeSessionId={selectedSession?.id ?? null}
              activeFilePath={activeFilePath}
              fileTree={sessionGroupFileTree}
              filesLoading={sessionGroupFileTreeLoading}
              filesError={sessionGroupFileTreeError}
              onClose={() => undefined}
              onFileClick={handleFileClick}
              onRefreshFiles={refreshTree}
              onLoadDirectory={loadDirectory}
              onDiffFileClick={handleDiffFileClick}
              onOpenTraffic={handleOpenTrafficTab}
              onBrowserTitleChange={handleBrowserTitleChange}
              bridgeAccess={bridgeAccess}
              onBridgeAccessRequested={refreshBridgeAccess}
            />
          );
        }
        return (
          <SpatialNewTab
            sessionId={selectedSession?.id ?? null}
            canStartChat={
              !!selectedSession && !selectedSession._optimistic && bridgeInteractionAllowed
            }
            canStartTerminal={!!selectedSession && terminalAllowed}
            canShowApplications={showApplicationsSidebarTab}
            defaultTool={selectedSession?.tool}
            defaultModel={selectedSession?.model}
            defaultReasoningEffort={selectedSession?.reasoningEffort}
            onConvert={(surface) => convertTab(tabId, surface)}
            onStartChat={(input) => startChatInTab(tabId, input)}
          />
        );
      }

      if (tabId === APP_CANVAS_TAB_ID) {
        return (
          <AppSessionWorkspace
            sessionId={selectedSession?.id ?? null}
            scrollToEventId={scrollToEventId}
            onScrollComplete={handleScrollComplete}
            onForkSession={handleOpenForkDialog}
            canForkSession={!!selectedSession && !selectedSessionIsOptimistic}
            canvasReady={appCanvasReady}
            canvas={
              <SessionGroupContentArea
                sessionGroupId={sessionGroupId}
                activeFilePath={null}
                openFiles={openFiles}
                activeTerminalId={null}
                activeTrafficEndpointId={null}
                selectedSession={null}
                sessionsByRecency={sessionsByRecency}
                canStartNewChat={false}
                onStartNewChat={handleNewChat}
                defaultBranch={groupRepo?.defaultBranch ?? "main"}
                getFileBuffer={getFileBuffer}
                setFileBuffer={setFileBuffer}
                scrollToEventId={null}
                onScrollComplete={handleScrollComplete}
                onForkSession={handleOpenForkDialog}
                canForkSession={false}
                emptyState={<AppSessionPreviewPanel sessionGroupId={sessionGroupId} />}
              />
            }
          />
        );
      }

      if (tabId.startsWith("artifact:")) {
        return <ArtifactTabContent artifactId={tabId.slice("artifact:".length)} />;
      }

      const tabSession = tabId.startsWith("session:")
        ? (groupSessions.find((session) => session.id === tabId.slice("session:".length)) ?? null)
        : null;
      const tabFilePath = tabId.startsWith("file:") ? tabId.slice("file:".length) : null;
      const tabTerminalId = tabId.startsWith("terminal:") ? tabId.slice("terminal:".length) : null;
      const tabTrafficEndpointId = tabId === "traffic" ? trafficEndpointId : null;

      return (
        <ArtifactOpenContext.Provider value={handleOpenArtifact}>
          <SessionGroupContentArea
            sessionGroupId={sessionGroupId}
            activeFilePath={tabFilePath}
            openFiles={openFiles}
            activeTerminalId={tabTerminalId}
            activeTrafficEndpointId={tabTrafficEndpointId}
            selectedSession={tabSession}
            sessionsByRecency={sessionsByRecency}
            canStartNewChat={!!tabSession && !tabSession._optimistic && bridgeInteractionAllowed}
            onStartNewChat={handleNewChat}
            defaultBranch={groupRepo?.defaultBranch ?? "main"}
            getFileBuffer={getFileBuffer}
            setFileBuffer={setFileBuffer}
            scrollToEventId={tabSession?.id === selectedSession?.id ? scrollToEventId : null}
            onScrollComplete={handleScrollComplete}
            onForkSession={handleOpenForkDialog}
            canForkSession={!!tabSession && !tabSession._optimistic}
          />
        </ArtifactOpenContext.Provider>
      );
    },
    [
      activeFilePath,
      appCanvasReady,
      bridgeAccess,
      bridgeInteractionAllowed,
      convertTab,
      draftWorkspaceTabs,
      getFileBuffer,
      groupRepo?.defaultBranch,
      groupSessions,
      handleDiffFileClick,
      handleFileClick,
      handleBrowserTitleChange,
      handleNewChat,
      handleOpenArtifact,
      handleOpenForkDialog,
      handleOpenTrafficTab,
      handleScrollComplete,
      isAppGroup,
      loadDirectory,
      openFiles,
      refreshBridgeAccess,
      refreshTree,
      scrollToEventId,
      selectedSession,
      selectedSessionIsOptimistic,
      sessionGroupFileTree,
      sessionGroupFileTreeError,
      sessionGroupFileTreeLoading,
      sessionGroupId,
      sessionsByRecency,
      setFileBuffer,
      showApplicationsSidebarTab,
      startChatInTab,
      terminalAllowed,
    ],
  );

  if (groupLoadError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-border bg-surface-deep p-5 text-center">
          <h1 className="text-base font-semibold text-foreground">Project unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{groupLoadError}</p>
        </div>
      </div>
    );
  }

  return (
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
              selectedSessionId={selectedSessionIsOptimistic ? null : (selectedSession?.id ?? null)}
              selectedAgentStatus={selectedSession?.agentStatus}
              displayAgentStatus={displayAgentStatus}
              selectedHosting={selectedSession?.hosting}
              selectedConnection={
                selectedSession?.connection as Record<string, unknown> | null | undefined
              }
              selectedWorktreeDeleted={selectedSession?.worktreeDeleted}
              closedSessions={closedSessions}
              onRestoreClosedSession={handleRestoreSession}
              canMoveSession={canMoveSelectedSession && selectedSessionBridgeInteractionAllowed}
              moveDisabledReason={moveDisabledReason}
              groupPrUrl={groupPrUrl}
              panelMode={panelMode}
              isFullscreen={isFullscreen}
              compactAppMode={isAppGroup}
              filesOpen={filesSidebarOpen}
              onToggleFiles={() => toggleFilesSidebar(sessionGroupId)}
              onToggleFullscreen={toggleFullscreen}
            />
            <div className="min-h-0 flex-1 overflow-hidden">
              <SpatialWorkspace
                persistenceKey={`trace:spatial-workspace:${sessionGroupId}`}
                tabs={workspaceTabs}
                preferredActiveTabId={preferredWorkspaceTabId}
                foregroundTabId={requestedActiveWorkspaceTabId}
                tabReplacements={workspaceTabReplacements}
                onTabReplacementsApplied={handleTabReplacementsApplied}
                onActivateTab={handleActivateWorkspaceTab}
                onCloseTab={handleCloseWorkspaceTab}
                onNewTab={handleNewWorkspaceTab}
                onOverlayVisibilityChange={handleWorkspaceOverlayVisibility}
                renderTab={renderWorkspaceTab}
              />
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
  );
}
