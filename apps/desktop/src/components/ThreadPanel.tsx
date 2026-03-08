import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AskUserQuestionNode,
  PlanReviewNode,
  TicketStatus,
} from "../types";
import { gql } from "@apollo/client";
import { WORKSPACE_FIELDS } from "../graphql/fragments";
import { useDeleteWorkspaceMutation } from "../__generated__/App.generated";
import {
  useSetTicketDependenciesMutation,
  useHandoffWorkspaceMutation,
} from "./__generated__/ThreadPanel.generated";
import { AskUserQuestionBar } from "./AskUserQuestionBar";
import { PlanResponseBar } from "./PlanResponseBar";
import { ThreadHeader } from "./ThreadHeader";
import { ThreadInput } from "./ThreadInput";
import { RunButtons } from "./RunButtons";
import { CreationStatusBar } from "./CreationStatusBar";
import { QueuedStatusBar } from "./QueuedStatusBar";
import { StickyTodoList } from "./StickyTodoList";
import { useAgentRunStore } from "../stores/agentRunStore";
import { useThreadStore } from "../stores/threadStore";
import { useTerminalStore } from "../stores/terminalStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useTabStore } from "../stores/tabStore";
import { useKanbanStore } from "../stores/kanbanStore";
import { useAppUIStore } from "../stores/appUIStore";
import { usePanelLayoutStore } from "../stores/panelLayoutStore";
import { useChannelContext } from "../context/ChannelContext";
import { useThreadScroll } from "../hooks/useThreadScroll";
import { useTicketFallback } from "../hooks/useTicketFallback";
import { useAuth } from "../context/AuthContext";
import { buildSessionNodes, normalizeToolName } from "../utils";
import {
  AgentContent,
  TicketContent,
  FilesContent,
} from "./tiling/PaneContent";
import { SplitTreeRenderer } from "./tiling/SplitTreeRenderer";
import { SingletonLayer } from "./tiling/SingletonLayer";
import { ProductDocInlineViewer } from "./ProductDocInlineViewer";
import type { RefObject } from "react";

// GQL used by setTicketDependencies (already defined in App.generated, just need the hook)
const _GQL_SET_TICKET_DEPENDENCIES = gql`
  mutation SetTicketDependencies(
    $channelId: ID!
    $workspaceId: ID!
    $dependsOnWorkspaceIds: [ID!]!
    $runConfig: JSON!
  ) {
    setTicketDependencies(
      channelId: $channelId
      workspaceId: $workspaceId
      dependsOnWorkspaceIds: $dependsOnWorkspaceIds
      runConfig: $runConfig
    ) {
      ...WorkspaceFields
    }
  }
  ${WORKSPACE_FIELDS}
`;

const _GQL_HANDOFF_WORKSPACE = gql`
  mutation HandoffWorkspace($channelId: ID!, $workspaceId: ID!) {
    handoffWorkspace(channelId: $channelId, workspaceId: $workspaceId) {
      ...WorkspaceFields
    }
  }
  ${WORKSPACE_FIELDS}
`;

const HANDOFF_ALLOWED_STATUSES = new Set([
  "in_progress",
  "needs_input",
  "completed",
  "creation",
]);

export function ThreadPanel({ asMainContent = false }: { asMainContent?: boolean }) {
  const { activeChannelId, enrichedActiveChannel, enrichedChannels } =
    useChannelContext();

  // ─── Thread store state ─────────────────────────────────────────
  const selectedWorkspaceId = useThreadStore((s) => s.selectedWorkspaceId);
  const activeSessionId = useThreadStore((s) => s.activeSessionId);
  const sessions = useThreadStore((s) => s.sessions);
  const sessionEvents = useThreadStore((s) => s.sessionEvents);
  const sessionStatus = useThreadStore((s) => s.sessionStatus);
  const loadingOlderEvents = useThreadStore((s) => s.loadingOlderEvents);
  const threadWidth = useThreadStore((s) => s.threadWidth);
  const expandedReadGroupIds = useThreadStore((s) => s.expandedReadGroupIds);
  const expandedTurnGroupIds = useThreadStore((s) => s.expandedTurnGroupIds);
  const hasWorktree = useThreadStore((s) => s.hasWorktree);
  const worktreePath = useThreadStore((s) => s.worktreePath);
  const toggleReadGroup = useThreadStore((s) => s.toggleReadGroup);
  const toggleTurnGroup = useThreadStore((s) => s.toggleTurnGroup);

  // ─── Terminal store state ───────────────────────────────────────
  const terminals = useTerminalStore((s) => s.terminals);
  const allTerminalEntries = useTerminalStore((s) => s.allTerminalEntries);
  const activeTerminalTabId = useTerminalStore((s) => s.activeTabId);
  const terminalCwd = useTerminalStore((s) => s.cwd);
  const runningPtyIds = useTerminalStore((s) => s.runningPtyIds);
  const ptyProcesses = useTerminalStore((s) => s.ptyProcesses);
  const setupOutput = useTerminalStore((s) =>
    selectedWorkspaceId ? s.setupOutputs[selectedWorkspaceId] : undefined,
  );

  // ─── UI store state ─────────────────────────────────────────────
  const isFullscreen = useAppUIStore((s) => s.isFullscreen);
  const dragging = useAppUIStore((s) => s.dragging);

  // ─── Agent run store state ─────────────────────────────────────
  const pendingRunWorkspaceId = useAgentRunStore(
    (s) => s.pendingRunWorkspaceId,
  );
  const pendingRunInitialPrompt = useAgentRunStore(
    (s) => s.pendingRunInitialPrompt,
  );
  const clearPendingRun = useAgentRunStore((s) => s.clearPendingRun);
  const activeRunWorkspaceIds = useAgentRunStore(
    (s) => s.activeRunWorkspaceIds,
  );
  const spawnedWorkspaceIds = useAgentRunStore((s) => s.spawnedWorkspaceIds);
  const runPendingWorkspace = useAgentRunStore(
    (s) => s.workspaceActions.runPendingWorkspace,
  );
  const stopAgent = useAgentRunStore((s) => s.workspaceActions.stopAgent);
  const sendThreadMessage = useAgentRunStore(
    (s) => s.workspaceActions.sendThreadMessage,
  );
  const sendPlanResponse = useAgentRunStore(
    (s) => s.workspaceActions.sendPlanResponse,
  );
  const markMerged = useAgentRunStore((s) => s.workspaceActions.markMerged);

  // ─── Derived state ──────────────────────────────────────────────
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const ciStatus = useWorkspaceStore((s) =>
    selectedWorkspaceId ? (s.ciStatuses[selectedWorkspaceId] ?? null) : null,
  );
  const kanbanColumns = useKanbanStore((s) => s.columns);

  const threadSelectedWorkspace = useThreadStore((s) => s.selectedWorkspace);
  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWorkspaceId) ?? threadSelectedWorkspace,
    [workspaces, selectedWorkspaceId, threadSelectedWorkspace],
  );

  const isProductDoc = selectedWorkspace?.isProductDoc ?? false;
  const isOrchestrator = selectedWorkspace?.isOrchestrator ?? false;

  const workspaceStatus: TicketStatus = useMemo(() => {
    return (selectedWorkspace?.status ?? "pending") as TicketStatus;
  }, [selectedWorkspace]);

  const workspaceUserId = useMemo(() => {
    return selectedWorkspace?.userId ?? null;
  }, [selectedWorkspace]);

  const { ticket, retriesExhausted, resetRetries } = useTicketFallback(selectedWorkspaceId, activeChannelId);

  const channelTickets = useMemo(
    () =>
      kanbanColumns.flatMap((col) =>
        col.tickets
          .filter(
            (t): t is typeof t & { workspaceId: string } =>
              t.workspaceId != null,
          )
          .map((t) => ({
            workspaceId: t.workspaceId,
            title: t.title,
            status: t.workspace?.status ?? "pending",
          })),
      ),
    [kanbanColumns],
  );

  const isViewingOlderSession = useMemo(() => {
    if (!activeSessionId || sessions.length === 0) return false;
    const latestSession = sessions[sessions.length - 1];
    return latestSession.id !== activeSessionId;
  }, [activeSessionId, sessions]);

  const isAgentRunning = useMemo(() => {
    if (!selectedWorkspaceId) return false;
    if (activeRunWorkspaceIds.has(selectedWorkspaceId)) return true;
    if (!spawnedWorkspaceIds.has(selectedWorkspaceId)) return false;
    if (sessionStatus === "empty") return false;
    const lastEvent = sessionEvents[sessionEvents.length - 1];
    if (lastEvent?.hookEventName === "Stop") return false;
    return true;
  }, [
    selectedWorkspaceId,
    activeRunWorkspaceIds,
    spawnedWorkspaceIds,
    sessionEvents,
    sessionStatus,
  ]);

  const pendingPromptForDisplay = useMemo(() => {
    if (pendingRunWorkspaceId === selectedWorkspaceId)
      return pendingRunInitialPrompt;
    return workspaces.find((w) => w.id === selectedWorkspaceId)?.preview ?? "";
  }, [
    pendingRunWorkspaceId,
    selectedWorkspaceId,
    pendingRunInitialPrompt,
    workspaces,
  ]);

  // ─── Channel-derived values ─────────────────────────────────────
  const repoPath = enrichedActiveChannel?.localRepoPath ?? "";
  const baseBranch = enrichedActiveChannel?.baseBranch ?? "main";
  const scriptsAvailable = Boolean(activeChannelId && hasWorktree === true);
  const hasSetupScript = Boolean(enrichedActiveChannel?.setupScript?.trim());
  const hasRunScript = Boolean(enrichedActiveChannel?.runScript?.trim());
  const effectiveTerminalCwd = terminalCwd || repoPath;
  const runScriptRunning = terminals.some(
    (t) => t.name === "Run" && runningPtyIds.has(t.terminalId),
  );

  // ─── Session nodes (derived from events) ────────────────────────
  const sessionNodes = useMemo(
    () => buildSessionNodes(sessionEvents),
    [sessionEvents],
  );

  // ─── Scroll ─────────────────────────────────────────────────────
  const {
    threadContentRef,
    showJumpToLatest,
    scrollThreadToBottom,
    onThreadScroll,
  } = useThreadScroll();
  const scrollToLatest = useMemo(
    () => () => scrollThreadToBottom("smooth"),
    [scrollThreadToBottom],
  );

  // ─── Mutations ──────────────────────────────────────────────────
  const [executeDeleteWorkspace] = useDeleteWorkspaceMutation();
  const [executeHandoffWorkspace] = useHandoffWorkspaceMutation();

  // ─── Saved widths ref for fullscreen ────────────────────────────
  const savedWidthsRef = useRef({ channel: 220, thread: 0 });

  // ─── Callbacks ──────────────────────────────────────────────────
  const handleEnterFullscreen = useCallback(async () => {
    const wsId = useThreadStore.getState().selectedWorkspaceId;
    if (!wsId || !repoPath) return;
    const result = await window.traceAPI.checkWorktreeExists(wsId, repoPath);
    if (!result.success || !result.exists || !result.worktreePath) return;

    const ui = useAppUIStore.getState();
    savedWidthsRef.current = {
      channel: ui.channelWidth,
      thread: useThreadStore.getState().threadWidth,
    };
    useAppUIStore.getState().setChannelWidth(0);
    useAppUIStore.getState().setIsFullscreen(true);
  }, [repoPath]);

  const handleExitFullscreen = useCallback(() => {
    useAppUIStore.getState().setIsFullscreen(false);
    useAppUIStore.getState().setChannelWidth(savedWidthsRef.current.channel);
    useThreadStore.getState().setThreadWidth(savedWidthsRef.current.thread);
  }, []);

  // Exit fullscreen and terminal/browser view when worktree is deleted
  useEffect(() => {
    if (hasWorktree === false) {
      if (isFullscreen) handleExitFullscreen();
      usePanelLayoutStore.getState().switchSingletonPanes("terminal", "agent");
      usePanelLayoutStore.getState().switchSingletonPanes("browser", "agent");
    }
  }, [handleExitFullscreen, hasWorktree, isFullscreen]);

  // Terminal initialization
  const handleInitializeTerminals = useCallback(async () => {
    const wsId = useThreadStore.getState().selectedWorkspaceId;
    if (!wsId || !activeChannelId || !repoPath) return;
    if (useTerminalStore.getState().isInitialized(wsId)) return;
    const worktreeResult = await window.traceAPI.checkWorktreeExists(
      wsId,
      repoPath,
    );
    if (
      !worktreeResult.success ||
      !worktreeResult.exists ||
      !worktreeResult.worktreePath
    )
      return;

    const env: Record<string, string> = {
      REPO_FOLDER: worktreeResult.worktreePath,
    };
    const portResult = await window.traceAPI.allocatePorts(wsId, 10);
    if (portResult.success && portResult.ports) {
      const ports = portResult.ports;
      env.PORT = String(ports[0]);
      env.TRACE_BASE_PORT = String(ports[0]);
      for (let i = 0; i < ports.length; i += 1)
        env[`TRACE_PORT_${i}`] = String(ports[i]);
    }

    useTerminalStore
      .getState()
      .initializeDefaults(wsId, worktreeResult.worktreePath, env);
  }, [activeChannelId, repoPath]);

  useEffect(() => {
    if (hasWorktree === true && selectedWorkspaceId)
      void handleInitializeTerminals();
  }, [hasWorktree, selectedWorkspaceId, handleInitializeTerminals]);

  const handleDeleteWorkspace = useCallback(async () => {
    const wsId = useThreadStore.getState().selectedWorkspaceId;
    if (!wsId || !activeChannelId) return;
    if (!window.confirm("Delete this workspace?")) return;

    useThreadStore.getState().closeThreadPanel();
    useTabStore.getState().closeTabsForWorkspace(wsId);

    try {
      await executeDeleteWorkspace({
        variables: { channelId: activeChannelId, workspaceId: wsId },
      });
      useWorkspaceStore.getState().removeWorkspace(wsId);
      useKanbanStore.getState().removeTicketByWorkspaceId(wsId);
      useTerminalStore.getState().killAllForWorkspace(wsId);
      void window.traceAPI.releasePorts(wsId);
      if (repoPath) {
        const script = enrichedActiveChannel?.teardownScript;
        const teardownCommands = script ? script.split("\n").map((l) => l.trim()).filter(Boolean) : undefined;
        void window.traceAPI.deleteWorktree(wsId, repoPath, teardownCommands);
      }
    } catch {
      console.error("Failed to delete workspace");
    }
  }, [activeChannelId, repoPath, enrichedActiveChannel, executeDeleteWorkspace]);

  const handleRerunScript = useCallback(
    async (tabName: string) => {
      const wsId = useThreadStore.getState().selectedWorkspaceId;
      if (!wsId || !activeChannelId || !repoPath) return;
      const worktreeResult = await window.traceAPI.checkWorktreeExists(
        wsId,
        repoPath,
      );
      if (
        !worktreeResult.success ||
        !worktreeResult.exists ||
        !worktreeResult.worktreePath
      )
        return;

      const channel = enrichedChannels.find(
        (item) => item.id === activeChannelId,
      );
      const script =
        tabName === "Setup" ? channel?.setupScript : channel?.runScript;
      if (!script?.trim()) return;

      const env: Record<string, string> = {
        REPO_FOLDER: worktreeResult.worktreePath,
      };
      if (tabName === "Run") {
        await window.traceAPI.releasePorts(wsId);
        const portResult = await window.traceAPI.allocatePorts(wsId, 10);
        if (portResult.success && portResult.ports) {
          const ports = portResult.ports;
          env.PORT = String(ports[0]);
          env.TRACE_BASE_PORT = String(ports[0]);
          for (let i = 0; i < ports.length; i += 1)
            env[`TRACE_PORT_${i}`] = String(ports[i]);
        }
      }

      useTerminalStore.getState().rerunTab(tabName, script, env);
    },
    [activeChannelId, enrichedChannels, repoPath],
  );

  const handleStopScript = useCallback((tabName: string) => {
    useTerminalStore.getState().stopTab(tabName);
    if (tabName === "Run") {
      const wsId = useThreadStore.getState().selectedWorkspaceId;
      if (wsId) void window.traceAPI.releasePorts(wsId);
    }
  }, []);

  const switchSession = useThreadStore((s) => s.syncActions.switchSession);
  const clearSession = useThreadStore((s) => s.syncActions.clearSession);

  // ─── Ticket dependencies mutation ───────────────────────────────
  const [executeSetTicketDependencies] = useSetTicketDependenciesMutation();
  const handleSetTicketDependencies = useCallback(
    async (
      workspaceId: string,
      depIds: string[],
      runConfig: {
        prompt: string;
        model: string;
        effort: string;
        planMode: boolean;
      },
    ) => {
      if (!activeChannelId) return;
      try {
        const { data } = await executeSetTicketDependencies({
          variables: {
            channelId: activeChannelId,
            workspaceId,
            dependsOnWorkspaceIds: depIds,
            runConfig,
          },
        });
        if (data?.setTicketDependencies) {
          useWorkspaceStore
            .getState()
            .upsertWorkspace(
              data.setTicketDependencies as import("../types").Workspace,
            );
          useThreadStore
            .getState()
            .syncSelectedWorkspace(
              data.setTicketDependencies as import("../types").Workspace,
            );
        }
      } catch {
        console.error("Failed to set ticket dependencies");
      }
    },
    [activeChannelId, executeSetTicketDependencies],
  );

  // ─── Auth ───────────────────────────────────────────────────────
  const { user: authUser } = useAuth();
  const isLockedByOther = Boolean(
    workspaceUserId && authUser && workspaceUserId !== authUser.id,
  );

  // ─── Handoff ──────────────────────────────────────────────────
  const canHandoff = Boolean(
    selectedWorkspaceId &&
    authUser &&
    workspaceUserId === authUser.id &&
    HANDOFF_ALLOWED_STATUSES.has(workspaceStatus),
  );

  const [handingOff, setHandingOff] = useState(false);

  const handleHandoff = useCallback(async () => {
    const wsId = useThreadStore.getState().selectedWorkspaceId;
    const chId = activeChannelId;
    if (!wsId || !chId) return;

    setHandingOff(true);
    try {
      // Stop agent if running
      if (isAgentRunning) {
        await window.traceAPI.stopAgent(wsId);
      }

      // Kill terminals and release ports
      useTerminalStore.getState().killAllForWorkspace(wsId);
      void window.traceAPI.releasePorts(wsId);

      // Commit any uncommitted changes so they appear in branchDiff for the next user
      await window.traceAPI.commitWorktreeChanges(wsId).catch(() => {});

      // Push branch to remote so other users can fetch it
      const rp = enrichedActiveChannel?.localRepoPath;
      if (rp) {
        await window.traceAPI.pushWorktreeBranch(wsId, rp).catch(() => {});
      }

      const { data } = await executeHandoffWorkspace({
        variables: { channelId: chId, workspaceId: wsId },
      });
      if (data?.handoffWorkspace) {
        const workspace = data.handoffWorkspace as import("../types").Workspace;
        useWorkspaceStore.getState().upsertWorkspace(workspace);
        useThreadStore.getState().syncSelectedWorkspace(workspace);
        useAgentRunStore.getState().removeSpawnedWorkspace(wsId);
        useAgentRunStore.getState().clearActiveRun(wsId);
      }
    } catch {
      console.error("Failed to hand off workspace");
    } finally {
      setHandingOff(false);
    }
  }, [
    activeChannelId,
    isAgentRunning,
    executeHandoffWorkspace,
    enrichedActiveChannel,
  ]);

  // ─── Create PR ─────────────────────────────────────────────────
  const canCreatePR = Boolean(
    selectedWorkspaceId &&
    !ticket?.workspace?.prUrl &&
    ticket?.workspace?.branch &&
    !isAgentRunning,
  );

  const handleCreatePR = useCallback(() => {
    void sendThreadMessage("/create-pr", [], []);
  }, [sendThreadMessage]);

  // ─── Memos ──────────────────────────────────────────────────────
  const lastUserMessageTime = useMemo(() => {
    for (let i = sessionNodes.length - 1; i >= 0; i--) {
      const node = sessionNodes[i];
      if (
        node.kind === "event" &&
        node.event.hookEventName === "UserPromptSubmit"
      ) {
        return node.event.timestamp;
      }
    }
    return null;
  }, [sessionNodes]);

  const latestTodos = useMemo(() => {
    for (let i = sessionNodes.length - 1; i >= 0; i--) {
      const node = sessionNodes[i];
      if (
        node.kind === "event" &&
        node.event.hookEventName === "PostToolUse" &&
        normalizeToolName(node.event.toolName) === "todowrite"
      ) {
        const input = node.event.toolInput as Record<string, unknown> | null;
        const todos = input?.todos as
          | Array<{ content: string; status: string; activeForm?: string }>
          | undefined;
        if (Array.isArray(todos) && todos.length > 0) return todos;
      }
    }
    return null;
  }, [sessionNodes]);

  const activeQuestionNode = useMemo((): AskUserQuestionNode | null => {
    if (isAgentRunning) return null;
    for (let i = sessionNodes.length - 1; i >= 0; i--) {
      const node = sessionNodes[i];
      if (node.kind === "ask-user-question") return node;
      if (
        node.kind === "event" &&
        node.event.hookEventName === "UserPromptSubmit"
      ) {
        break;
      }
    }
    return null;
  }, [sessionNodes, isAgentRunning]);

  const [dismissedQuestionId, setDismissedQuestionId] = useState<string | null>(
    null,
  );
  const showQuestion =
    activeQuestionNode && activeQuestionNode.id !== dismissedQuestionId
      ? activeQuestionNode
      : null;

  const activePlanNode = useMemo((): PlanReviewNode | null => {
    if (isAgentRunning) return null;
    const last = sessionNodes[sessionNodes.length - 1];
    if (last?.kind === "plan-review") return last;
    return null;
  }, [sessionNodes, isAgentRunning]);

  const [dismissedPlanId, setDismissedPlanId] = useState<string | null>(null);
  const showPlan =
    activePlanNode && activePlanNode.id !== dismissedPlanId
      ? activePlanNode
      : null;

  // ─── Layout store ─────────────────────────────────────────────
  const layoutRoot = usePanelLayoutStore((s) => s.root);

  const prevWorkspaceIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prevId = prevWorkspaceIdRef.current;
    prevWorkspaceIdRef.current = selectedWorkspaceId;

    // Save layout for the workspace we're leaving
    if (prevId) {
      usePanelLayoutStore.getState().saveLayoutForWorkspace(prevId);
    }

    // Restore or reset layout for the workspace we're entering
    if (selectedWorkspaceId) {
      usePanelLayoutStore
        .getState()
        .restoreOrResetForWorkspace(
          selectedWorkspaceId,
          workspaceStatus === "merged",
          ticket !== null,
        );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId]);

  const containerRef = useRef<HTMLDivElement>(null);
  const singletonClaimRefs = useMemo(
    () => new Map<string, RefObject<HTMLDivElement | null>>(),
    [],
  );

  const isOpen = selectedWorkspaceId !== null;

  const fillMode = isFullscreen || asMainContent;

  return (
    <>
      {!fillMode && isOpen && (
        <div
          className={`resize-handle ${dragging === "right" ? "active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            useAppUIStore.getState().setDragging("right");
          }}
        />
      )}

      <div
        id="thread-panel"
        className={`flex min-h-0 flex-col overflow-hidden ${fillMode ? "" : "shrink-0"} ${!fillMode && isOpen ? "border-l border-edge" : ""} bg-surface-deep ${dragging ? "" : "panel-animate"}`}
        style={
          fillMode
            ? { flex: "1 1 0%" }
            : { width: isOpen ? `${threadWidth}px` : 0 }
        }
      >
        <ThreadHeader
          selectedWorkspaceId={selectedWorkspaceId}
          channelId={activeChannelId}
          workspaceStatus={workspaceStatus}
          hasWorktree={hasWorktree}
          worktreePath={worktreePath}
          isFullscreen={isFullscreen}
          onDeleteWorkspace={() => {
            void handleDeleteWorkspace();
          }}
          canHandoff={canHandoff}
          handingOff={handingOff}
          onHandoff={() => {
            void handleHandoff();
          }}
          onEnterFullscreen={() => {
            void handleEnterFullscreen();
          }}
          onExitFullscreen={handleExitFullscreen}
          onMarkMerged={() => void markMerged()}
          prUrl={ticket?.workspace?.prUrl ?? null}
          ciStatus={ciStatus}
          canCreatePR={canCreatePR}
          onCreatePR={handleCreatePR}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSwitchSession={switchSession}
          ticketTitle={ticket?.title ?? selectedWorkspace?.preview ?? null}
          user={selectedWorkspace?.user ?? null}
          isOrchestrator={isOrchestrator}
        />

        <div
          ref={containerRef}
          className="thread-panel-shell relative flex min-h-0 flex-1"
        >
          {isOrchestrator ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <AgentContent
                threadContentRef={threadContentRef}
                onThreadScroll={onThreadScroll}
                sessionNodes={sessionNodes}
                sessionStatus={sessionStatus}
                activeSessionId={activeSessionId}
                loadingOlderEvents={loadingOlderEvents}
                expandedReadGroupIds={expandedReadGroupIds}
                expandedTurnGroupIds={expandedTurnGroupIds}
                toggleReadGroup={toggleReadGroup}
                toggleTurnGroup={toggleTurnGroup}
                showJumpToLatest={showJumpToLatest}
                scrollToLatest={scrollToLatest}
              />
              <ThreadInput
                isAgentRunning={isAgentRunning}
                lastUserMessageTime={lastUserMessageTime}
                onSendThreadMessage={sendThreadMessage}
                onStopAgent={() => void stopAgent()}
                onClearThread={clearSession}
              />
            </div>
          ) : isProductDoc ? (
            <ProductDocInlineViewer
              key={selectedWorkspaceId}
              worktreePath={worktreePath}
              selectedWorkspaceId={selectedWorkspaceId}
              threadContentRef={threadContentRef}
              onThreadScroll={onThreadScroll}
              sessionNodes={sessionNodes}
              sessionStatus={sessionStatus}
              activeSessionId={activeSessionId}
              loadingOlderEvents={loadingOlderEvents}
              expandedReadGroupIds={expandedReadGroupIds}
              expandedTurnGroupIds={expandedTurnGroupIds}
              toggleReadGroup={toggleReadGroup}
              toggleTurnGroup={toggleTurnGroup}
              showJumpToLatest={showJumpToLatest}
              scrollToLatest={scrollToLatest}
            />
          ) : (
          <>
          <SplitTreeRenderer
            node={layoutRoot}
            renderPaneContent={(mode) => {
              if (mode === "agent") {
                return (
                  <>
                    <AgentContent
                      threadContentRef={threadContentRef}
                      onThreadScroll={onThreadScroll}
                      sessionNodes={sessionNodes}
                      sessionStatus={sessionStatus}
                      activeSessionId={activeSessionId}
                      loadingOlderEvents={loadingOlderEvents}
                      expandedReadGroupIds={expandedReadGroupIds}
                      expandedTurnGroupIds={expandedTurnGroupIds}
                      toggleReadGroup={toggleReadGroup}
                      toggleTurnGroup={toggleTurnGroup}
                      showJumpToLatest={showJumpToLatest}
                      scrollToLatest={scrollToLatest}
                    />

                    {isAgentRunning && latestTodos && (
                      <StickyTodoList todos={latestTodos} />
                    )}

                    {isLockedByOther &&
                    workspaceStatus !== "pending" &&
                    workspaceStatus !== "handed_off" ? (
                      <div className="flex items-center justify-center border-t border-edge px-4 py-3">
                        <span className="text-xs text-muted">
                          Workspace locked by another user (read-only)
                        </span>
                      </div>
                    ) : (pendingRunWorkspaceId === selectedWorkspaceId ||
                        workspaceStatus === "pending" ||
                        workspaceStatus === "handed_off") &&
                      !isAgentRunning ? (
                      <RunButtons
                        initialPrompt={pendingPromptForDisplay}
                        onRun={(planMode, prompt, attachmentIds, filePaths) => {
                          if (
                            pendingRunWorkspaceId !== selectedWorkspaceId &&
                            selectedWorkspaceId
                          ) {
                            useAgentRunStore
                              .getState()
                              .setPendingRun(
                                selectedWorkspaceId,
                                prompt,
                                filePaths ?? [],
                                attachmentIds,
                              );
                          }
                          void runPendingWorkspace(
                            planMode,
                            prompt,
                            attachmentIds,
                            filePaths,
                          );
                        }}
                        channelTickets={channelTickets}
                        currentWorkspaceId={
                          selectedWorkspaceId ?? pendingRunWorkspaceId
                        }
                        onRunAfter={(depIds, runConfig) => {
                          const wsId =
                            pendingRunWorkspaceId ?? selectedWorkspaceId;
                          if (wsId) {
                            if (pendingRunWorkspaceId !== wsId) {
                              useAgentRunStore
                                .getState()
                                .setPendingRun(wsId, runConfig.prompt, []);
                            }
                            void handleSetTicketDependencies(
                              wsId,
                              depIds,
                              runConfig,
                            );
                            clearPendingRun();
                          }
                        }}
                      />
                    ) : workspaceStatus === "creation" ? (
                      <CreationStatusBar />
                    ) : workspaceStatus === "queued" ? (
                      <QueuedStatusBar
                        key={selectedWorkspaceId}
                        workspaceId={selectedWorkspaceId!}
                      />
                    ) : showPlan ? (
                      <PlanResponseBar
                        node={showPlan}
                        questionNode={activeQuestionNode}
                        onPlanResponse={(text, mode) => {
                          setDismissedPlanId(showPlan.id);
                          if (activeQuestionNode)
                            setDismissedQuestionId(activeQuestionNode.id);
                          void sendPlanResponse(
                            text,
                            mode,
                            showPlan.planContent,
                            showPlan.planFilePath,
                          );
                        }}
                        onDismiss={() => {
                          setDismissedPlanId(showPlan.id);
                          if (activeQuestionNode)
                            setDismissedQuestionId(activeQuestionNode.id);
                          void stopAgent();
                        }}
                      />
                    ) : showQuestion ? (
                      <AskUserQuestionBar
                        node={showQuestion}
                        onResponse={(text) => {
                          if (activePlanNode)
                            setDismissedPlanId(activePlanNode.id);
                          const inPlanMode = selectedWorkspace?.cliSession?.permissionMode === "plan";
                          void sendPlanResponse(text, inPlanMode ? "revise" : "keep-context");
                        }}
                        onDismiss={() => {
                          setDismissedQuestionId(showQuestion.id);
                          if (activePlanNode)
                            setDismissedPlanId(activePlanNode.id);
                          void stopAgent();
                        }}
                      />
                    ) : isViewingOlderSession ? (
                      <div className="flex items-center justify-center border-t border-edge px-4 py-3">
                        <span className="text-xs text-muted">
                          Viewing older session (read-only)
                        </span>
                      </div>
                    ) : (
                      <ThreadInput
                        isAgentRunning={isAgentRunning}
                        lastUserMessageTime={lastUserMessageTime}
                        onSendThreadMessage={sendThreadMessage}
                        onStopAgent={() => void stopAgent()}
                        onClearThread={clearSession}
                      />
                    )}
                  </>
                );
              }
              if (mode === "ticket") {
                return <TicketContent ticket={ticket} retriesExhausted={retriesExhausted} onRetry={resetRetries} />;
              }
              if (mode === "files") {
                return (
                  <FilesContent
                    workspaceId={selectedWorkspaceId}
                    baseBranch={baseBranch}
                  />
                );
              }
              // terminal/browser are singletons — rendered in SingletonLayer
              return null;
            }}
            singletonClaimRefs={singletonClaimRefs}
          />
          <SingletonLayer
            containerRef={containerRef}
            singletonClaimRefs={singletonClaimRefs}
            terminals={terminals}
            allTerminalEntries={allTerminalEntries}
            currentWorkspaceId={selectedWorkspaceId}
            activeTerminalTabId={activeTerminalTabId}
            terminalCwd={effectiveTerminalCwd}
            runScriptRunning={runScriptRunning}
            scriptsAvailable={scriptsAvailable}
            hasSetupScript={hasSetupScript}
            hasRunScript={hasRunScript}
            setupOutput={setupOutput}
            ptyProcesses={ptyProcesses}
            hasWorktree={hasWorktree}
            onSelectTab={useTerminalStore.getState().setActiveTabId}
            onCloseTab={useTerminalStore.getState().killTerminal}
            onCloseAll={() => {
              const wsId = useThreadStore.getState().selectedWorkspaceId;
              if (wsId) useTerminalStore.getState().killAllForWorkspace(wsId);
            }}
            onAddTab={useTerminalStore.getState().addTerminal}
            onRunScript={() => {
              void handleRerunScript("Run");
            }}
            onStopScript={() => handleStopScript("Run")}
            onRerunSetup={() => {
              void handleRerunScript("Setup");
            }}
            onOpenSettings={() => {
              if (activeChannelId)
                useAppUIStore.getState().setSettingsChannelId(activeChannelId);
            }}
            browserWorkspaceId={selectedWorkspaceId}
          />
          </>
          )}
        </div>
      </div>
    </>
  );
}
