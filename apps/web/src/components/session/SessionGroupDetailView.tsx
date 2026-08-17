import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Activity,
  AppWindow,
  Bot,
  FileCode,
  Files,
  GitCompareArrows,
  Globe,
  TerminalSquare,
} from "lucide-react";
import { gql } from "@urql/core";
import { client } from "../../lib/urql";
import { SESSION_TERMINALS_QUERY, START_SESSION_MUTATION } from "@trace/client-core";
import type { Terminal } from "@trace/gql";
import { useDetailPanelStore } from "../../stores/detail-panel";
import { useEntityField, useEntityStore } from "@trace/client-core";
import type { SessionEntity, SessionGroupEntity } from "@trace/client-core";
import { useTerminalStore, useSessionGroupTerminals } from "../../stores/terminal";
import { useUIStore, type UIState } from "../../stores/ui";
import { getSessionChannelId, getSessionGroupChannelId } from "@trace/client-core";
import { optimisticallyInsertSession } from "../../lib/optimistic-session";
import { GroupHeader } from "./GroupHeader";
import { FileCommandPalette } from "./FileCommandPalette";
import { ForkSessionDialog } from "./ForkSessionDialog";
import { SessionGroupContentArea } from "./SessionGroupContentArea";
import { ProjectPreviewWorkspace } from "./ProjectPreviewWorkspace";
import { AttachmentOpenContext, UploadedAttachmentOpenContext } from "./AttachmentOpenContext";
import { FileOpenContext } from "./FileOpenContext";
import { WorkspaceSurfaceContent, type WorkspaceSurface } from "./SidebarPanel";
import { SpatialWorkspace, type SpatialWorkspaceTab } from "./SpatialWorkspace";
import { SpatialNewTab } from "./SpatialNewTab";
import { sendOptimisticSessionMessage } from "./sendOptimisticSessionMessage";
import { AppSessionPreviewPanel } from "./applications/AppSessionPreviewPanel";
import { AnimationSessionPreviewPanel } from "./applications/AnimationSessionPreviewPanel";
import { GeneratedProjectPreviewPanel } from "./applications/GeneratedProjectPreviewPanel";
import { hasSavedDesignPreview } from "./applications/saved-design-preview";
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
import { isAnimationCanvasReady, isAppCanvasReady } from "./app-session-readiness";
import { isGeneratedProjectCanvasReady } from "./generated-project-readiness";
import { getProjectWorkspaceKind, usesFloatingProjectChat } from "./project-workspace-kind";
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

const EMPTY_ARTIFACT_IDS: string[] = [];
const EMPTY_HIDDEN_SESSION_TABS: Record<string, string> = {};
const SESSION_WORKSPACE_TABS_KEY_PREFIX = "trace:session-workspace-tabs:";

function isWorkspaceSurface(value: unknown): value is WorkspaceSurface {
  return (
    value === "applications" ||
    value === "browser" ||
    value === "terminal" ||
    value === "files" ||
    value === "changes"
  );
}

function getStoredWorkspaceTabs(
  sessionGroupId: string,
): Array<{ id: string; surface: WorkspaceSurface | null }> {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(`${SESSION_WORKSPACE_TABS_KEY_PREFIX}${sessionGroupId}`);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (tab): tab is { id: string; surface: WorkspaceSurface | null } =>
        !!tab &&
        typeof tab === "object" &&
        typeof (tab as Record<string, unknown>).id === "string" &&
        ((tab as Record<string, unknown>).surface === null ||
          isWorkspaceSurface((tab as Record<string, unknown>).surface)),
    );
  } catch {
    return [];
  }
}

function workspaceSurfaceIcon(surface: WorkspaceSurface | null) {
  if (surface === "browser") return <Globe size={12} />;
  if (surface === "terminal") return <TerminalSquare size={12} />;
  if (surface === "files") return <Files size={12} />;
  if (surface === "changes") return <GitCompareArrows size={12} />;
  if (surface === "applications") return <AppWindow size={12} />;
  return <Bot size={12} />;
}

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
      designSystemVersionId
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
      designPreviewUrl
      pdfExportStatus
      pdfExportCommitSha
      pdfExportCapturedAt
      pdfExportError
      pdfPageWidth
      pdfPageHeight
      pdfPageUnit
      pdfFormatVersion
      animationPreviewUrl
      animationPreviewStatus
      animationPreviewCommitSha
      animationPreviewCapturedAt
      animationPreviewError
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
  const groupDesignPreviewUrl = useEntityField(
    "sessionGroups",
    sessionGroupId,
    "designPreviewUrl",
  ) as string | null | undefined;
  const groupAnimationPreviewUrl = useEntityField(
    "sessionGroups",
    sessionGroupId,
    "animationPreviewUrl",
  ) as string | null | undefined;
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
  const pinnedTerminalIds = useTerminalStore((s) => s.pinnedTerminalIds);
  const unpinTerminal = useTerminalStore((s) => s.unpinTerminal);

  const [trafficEndpointId, setTrafficEndpointId] = useState<string | null>(null);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<"session" | "traffic">("session");
  const [scrollToEventId, setScrollToEventId] = useState<string | null>(null);
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [forkEventId, setForkEventId] = useState<string | null>(null);
  const [filePaletteOpen, setFilePaletteOpen] = useState(false);
  const [groupLoadError, setGroupLoadError] = useState<string | null>(null);
  const [draftWorkspaceTabs, setDraftWorkspaceTabs] = useState<
    Array<{ id: string; surface: WorkspaceSurface | null }>
  >(() => getStoredWorkspaceTabs(sessionGroupId));

  useEffect(() => {
    try {
      localStorage.setItem(
        `${SESSION_WORKSPACE_TABS_KEY_PREFIX}${sessionGroupId}`,
        JSON.stringify(draftWorkspaceTabs),
      );
    } catch {
      // Persistence is optional when browser storage is unavailable.
    }
  }, [draftWorkspaceTabs, sessionGroupId]);

  const handleOpenForkDialog = useCallback((eventId: string) => {
    setForkEventId(eventId);
    setForkDialogOpen(true);
  }, []);
  const addTerminal = useTerminalStore((s) => s.addTerminal);

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

  const { handleOpenTerminal, handleSelectTerminal: selectTerminal } = useTerminalActions({
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

  const handleCloseArtifact = useCallback(
    (artifactId: string) => closeArtifactTab(sessionGroupId, artifactId),
    [closeArtifactTab, sessionGroupId],
  );

  useEffect(() => {
    if (activeFilePath || activeTerminalId || activeWorkflowTab === "traffic") {
      setActiveArtifactId(null);
    }
  }, [activeFilePath, activeTerminalId, activeWorkflowTab, setActiveArtifactId]);

  useEffect(() => {
    setActiveArtifactId(null);
  }, [activeSessionId, setActiveArtifactId]);

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
  const projectWorkspaceKind = getProjectWorkspaceKind(groupKind);
  const isAppGroup = projectWorkspaceKind === "app";
  const isAnimationGroup = projectWorkspaceKind === "animation";
  const isGeneratedProjectGroup =
    projectWorkspaceKind === "design" ||
    projectWorkspaceKind === "design_system" ||
    projectWorkspaceKind === "pdf";
  const isCanvasWorkspace = projectWorkspaceKind !== null;
  const floatingProjectChat = usesFloatingProjectChat(projectWorkspaceKind);
  const selectedConnection = selectedSession?.connection as
    | Record<string, unknown>
    | null
    | undefined;
  const liveGeneratedProjectCanvasReady = isGeneratedProjectCanvasReady(
    selectedSession?.agentStatus,
    selectedConnection?.state,
    groupConnection?.state,
  );
  const generatedProjectCanvasReady =
    liveGeneratedProjectCanvasReady ||
    ((groupKind === "design" || groupKind === "design_system") &&
      hasSavedDesignPreview(groupDesignPreviewUrl));
  const appCanvasReady = isAppCanvasReady(
    selectedSession?.agentStatus,
    selectedConnection?.state,
    groupConnection?.state,
  );
  const animationCanvasReady = isAnimationCanvasReady(appCanvasReady, groupAnimationPreviewUrl);
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

  const handleClosePinnedTerminal = useCallback(
    (terminalId: string) => {
      unpinTerminal(terminalId);
      if (activeTerminalId === terminalId) setActiveTerminalId(null);
    },
    [activeTerminalId, setActiveTerminalId, unpinTerminal],
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

  const canInteract = !selectedSessionIsOptimistic;
  const canNewChatCmd =
    !!selectedSession && !selectedSessionIsOptimistic && bridgeInteractionAllowed;
  const canOpenTerminalCmd = !selectedSessionIsOptimistic && terminalAllowed;

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
    if (selectedSession.hosting === "cloud" && repoRemoteKnownMissing(selectedRepo)) {
      toast.error("Cloud is unavailable for this repo", {
        description: CLOUD_REPO_REMOTE_REQUIRED,
      });
      return null;
    }
    const selectedHosting = resolveSupportedHostingForRepo(selectedSession.hosting, selectedRepo);
    const result = await client
      .mutation(START_SESSION_MUTATION, {
        input: {
          tool: selectedSession.tool,
          model: selectedSession.model ?? undefined,
          reasoningEffort: selectedSession.reasoningEffort ?? undefined,
          channelId: resolvedChannelId ?? undefined,
          repoId: selectedRepo?.id,
          branch: groupBranch ?? selectedSession.branch ?? undefined,
          sessionGroupId,
          sourceSessionId: selectedSession.id,
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
    setActiveArtifactId(null);
    return newSessionId;
  }, [
    groupSessions,
    groupBranch,
    bridgeInteractionAllowed,
    groupRepo,
    openSessionTab,
    selectedSession,
    sessionGroupId,
    setActiveArtifactId,
    setActiveSessionId,
  ]);

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
      handleClosePinnedTerminal(activeTerminalId);
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
    handleClosePinnedTerminal,
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

  const workspaceTabs = useMemo<SpatialWorkspaceTab[]>(() => {
    const tabs: SpatialWorkspaceTab[] = sessionTabs.map((session) => ({
      id: `session:${session.id}`,
      label: session.name,
      icon: <Bot size={12} />,
      status: session.agentStatus === "active" ? "live" : undefined,
    }));

    tabs.push(
      ...openArtifactIds.map((artifactId) => ({
        id: `artifact:${artifactId}`,
        label: "Artifact",
        icon: <FileCode size={12} />,
      })),
      ...terminals
        .filter((terminal) => pinnedTerminalIds[terminal.id])
        .map((terminal, index) => ({
          id: `terminal:${terminal.id}`,
          label: terminal.customName || `Terminal ${index + 1}`,
          icon: <TerminalSquare size={12} />,
          status: terminal.status === "active" ? ("live" as const) : undefined,
        })),
      ...openFiles.map((file) => ({
        id: `file:${file.filePath}`,
        label: file.fileName,
        icon: file.isDiff ? <GitCompareArrows size={12} /> : <FileCode size={12} />,
        status: file.isDiff ? ("changed" as const) : undefined,
      })),
      ...draftWorkspaceTabs.map((draft) => ({
        id: draft.id,
        label: draft.surface
          ? draft.surface === "changes"
            ? "Files changed"
            : `${draft.surface[0].toUpperCase()}${draft.surface.slice(1)}`
          : "New tab",
        icon: workspaceSurfaceIcon(draft.surface),
        minContentWidth: draft.surface === "browser" ? 0 : undefined,
      })),
    );

    if (trafficEndpointId) {
      tabs.push({
        id: "traffic",
        label: "Traffic",
        icon: <Activity size={12} />,
      });
    }
    return tabs;
  }, [
    draftWorkspaceTabs,
    openArtifactIds,
    openFiles,
    pinnedTerminalIds,
    sessionTabs,
    showApplicationsSidebarTab,
    terminals,
    trafficEndpointId,
  ]);

  const preferredWorkspaceTabId = activeArtifactId
    ? `artifact:${activeArtifactId}`
    : activeFilePath
      ? `file:${activeFilePath}`
      : activeTerminalId
        ? `terminal:${activeTerminalId}`
        : activeWorkflowTab === "traffic" && trafficEndpointId
          ? "traffic"
          : selectedSession
            ? `session:${selectedSession.id}`
            : draftWorkspaceTabs[0]?.id ?? null;

  const handleActivateWorkspaceTab = useCallback(
    (tabId: string) => {
      if (tabId.startsWith("session:")) {
        handleSelectSession(tabId.slice("session:".length));
      } else if (tabId.startsWith("artifact:")) {
        handleSelectArtifact(tabId.slice("artifact:".length));
      } else if (tabId.startsWith("terminal:")) {
        const terminalId = tabId.slice("terminal:".length);
        const terminal = terminals.find((candidate) => candidate.id === terminalId);
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
      terminals,
    ],
  );

  const handleCloseWorkspaceTab = useCallback(
    (tabId: string) => {
      if (tabId.startsWith("draft:")) {
        setDraftWorkspaceTabs((drafts) => drafts.filter((draft) => draft.id !== tabId));
      } else if (tabId.startsWith("session:")) {
        handleCloseSession(tabId.slice("session:".length));
      } else if (tabId.startsWith("artifact:")) {
        handleCloseArtifact(tabId.slice("artifact:".length));
      } else if (tabId.startsWith("terminal:")) {
        handleClosePinnedTerminal(tabId.slice("terminal:".length));
      } else if (tabId.startsWith("file:")) {
        handleCloseFile(tabId.slice("file:".length));
      } else if (tabId === "traffic") {
        handleCloseTrafficTab();
      }
    },
    [
      handleCloseArtifact,
      handleCloseFile,
      handleClosePinnedTerminal,
      handleCloseSession,
      handleCloseTrafficTab,
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

  const renderWorkspaceTab = useCallback(
    (tabId: string) => {
      if (tabId.startsWith("draft:")) {
        const draft = draftWorkspaceTabs.find((candidate) => candidate.id === tabId);
        if (draft?.surface) {
          return (
            <WorkspaceSurfaceContent
              sessionGroupId={sessionGroupId}
              browserId={tabId}
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
              bridgeAccess={bridgeAccess}
              onBridgeAccessRequested={refreshBridgeAccess}
            />
          );
        }
        return (
          <SpatialNewTab
            canStartChat={
              !!selectedSession && !selectedSession._optimistic && bridgeInteractionAllowed
            }
            canShowApplications={showApplicationsSidebarTab}
            onConvert={(surface) =>
              setDraftWorkspaceTabs((drafts) =>
                drafts.map((candidate) =>
                  candidate.id === tabId ? { ...candidate, surface } : candidate,
                ),
              )
            }
            onStartChat={async (prompt) => {
              const sessionId = await handleNewChat();
              if (!sessionId) return;
              await sendOptimisticSessionMessage({ sessionId, text: prompt });
              setDraftWorkspaceTabs((drafts) =>
                drafts.filter((candidate) => candidate.id !== tabId),
              );
            }}
          />
        );
      }

      if (tabId.startsWith("surface:")) {
        if (tabId === "surface:browser" && isCanvasWorkspace) {
          const canvasReady = isAppGroup
            ? appCanvasReady
            : isAnimationGroup
              ? animationCanvasReady
              : generatedProjectCanvasReady;
          const canvasKey = isAppGroup
            ? "app-canvas"
            : isAnimationGroup
              ? "animation-canvas"
              : "generated-project-canvas";
          const emptyState = isAppGroup ? (
            <AppSessionPreviewPanel sessionGroupId={sessionGroupId} />
          ) : isAnimationGroup ? (
            <AnimationSessionPreviewPanel sessionGroupId={sessionGroupId} />
          ) : (
            <GeneratedProjectPreviewPanel
              sessionGroupId={sessionGroupId}
              projectKind={projectWorkspaceKind === "pdf" ? "pdf" : "design"}
            />
          );

          return (
            <ProjectPreviewWorkspace
              onOpenArtifact={handleOpenArtifact}
              sessionId={selectedSession?.id ?? null}
              scrollToEventId={scrollToEventId}
              onScrollComplete={handleScrollComplete}
              onForkSession={handleOpenForkDialog}
              canForkSession={!!selectedSession && !selectedSessionIsOptimistic}
              canvasReady={canvasReady}
              canvasKey={canvasKey}
              floatingChat={floatingProjectChat}
              manualSessionGroupId={isGeneratedProjectGroup ? sessionGroupId : undefined}
              showCanvasWhileLoading={
                projectWorkspaceKind === "design" || projectWorkspaceKind === "design_system"
              }
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
                  emptyState={emptyState}
                />
              }
            />
          );
        }

        return (
          <WorkspaceSurfaceContent
            sessionGroupId={sessionGroupId}
            browserId={tabId}
            surface={tabId.slice("surface:".length) as WorkspaceSurface}
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
            bridgeAccess={bridgeAccess}
            onBridgeAccessRequested={refreshBridgeAccess}
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
      const tabTerminalId = tabId.startsWith("terminal:")
        ? tabId.slice("terminal:".length)
        : null;
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
      animationCanvasReady,
      appCanvasReady,
      bridgeAccess,
      bridgeInteractionAllowed,
      draftWorkspaceTabs,
      getFileBuffer,
      generatedProjectCanvasReady,
      groupRepo?.defaultBranch,
      groupSessions,
      handleDiffFileClick,
      handleFileClick,
      handleNewChat,
      handleOpenArtifact,
      handleOpenForkDialog,
      handleOpenTrafficTab,
      handleScrollComplete,
      isAnimationGroup,
      isAppGroup,
      isCanvasWorkspace,
      isGeneratedProjectGroup,
      loadDirectory,
      openFiles,
      refreshBridgeAccess,
      refreshTree,
      floatingProjectChat,
      projectWorkspaceKind,
      scrollToEventId,
      selectedSession?.id,
      selectedSessionIsOptimistic,
      sessionGroupFileTree,
      sessionGroupFileTreeError,
      sessionGroupFileTreeLoading,
      sessionGroupId,
      sessionsByRecency,
      setFileBuffer,
      showApplicationsSidebarTab,
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
              compactCanvasMode={isCanvasWorkspace}
              onToggleFullscreen={toggleFullscreen}
            />
            <div className="min-h-0 flex-1 overflow-hidden">
              <SpatialWorkspace
                persistenceKey={`trace:spatial-workspace:${sessionGroupId}`}
                tabs={workspaceTabs}
                preferredActiveTabId={preferredWorkspaceTabId}
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
