import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AskUserQuestionNode,
  PlanReviewNode,
  SessionStatus,
  TicketStatus,
} from "../types";
import { gql } from "@apollo/client";
import { WORKSPACE_FIELDS } from "../graphql/fragments";
import { useUpdateWorkspaceStatusMutation } from "../__generated__/App.generated";
import { useSetTicketDependenciesMutation, useHandoffWorkspaceMutation } from "./__generated__/ThreadPanel.generated";
import { ThreadEvent, PlanReview, AskUserQuestionInline } from "./ThreadEvent";
import { ReadGlobGroup } from "./ReadGlobGroup";
import { CollapsedTurnGroup } from "./CollapsedTurnGroup";
import { AssistantTextRow } from "./thread-events/AssistantTextRow";
import { AskUserQuestionBar } from "./AskUserQuestionBar";
import { PlanResponseBar } from "./PlanResponseBar";
import { TicketView } from "./TicketView";
import { WorktreeChanges } from "./WorktreeChanges";
import { TerminalTabs } from "./TerminalTabs";
import { ThreadHeader } from "./ThreadHeader";
import { ThreadInput } from "./ThreadInput";
import { RunButtons } from "./RunButtons";
import { CreationStatusBar } from "./CreationStatusBar";
import { QueuedStatusBar } from "./QueuedStatusBar";
import { StickyTodoList } from "./StickyTodoList";
import { useClaudeRunStore } from "../stores/claudeRunStore";
import { useThreadStore } from "../stores/threadStore";
import { useTerminalStore } from "../stores/terminalStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useKanbanStore } from "../stores/kanbanStore";
import { useAppUIStore } from "../stores/appUIStore";
import { useChannelContext } from "../context/ChannelContext";
import { useThreadScroll } from "../hooks/useThreadScroll";
import { useAuth } from "../context/AuthContext";
import { buildSessionNodes, normalizeToolName, stripTraceInternal } from "../utils";

// GQL used by setTicketDependencies (already defined in App.generated, just need the hook)
const _GQL_SET_TICKET_DEPENDENCIES = gql`
  mutation SetTicketDependencies($channelId: ID!, $workspaceId: ID!, $dependsOnWorkspaceIds: [ID!]!, $runConfig: JSON!) {
    setTicketDependencies(channelId: $channelId, workspaceId: $workspaceId, dependsOnWorkspaceIds: $dependsOnWorkspaceIds, runConfig: $runConfig) {
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

type ViewMode = "agent" | "ticket" | "files" | "terminal";

const HANDOFF_ALLOWED_STATUSES = new Set(['in_progress', 'needs_input', 'completed', 'creation']);

export function ThreadPanel() {
  const { activeChannelId, enrichedActiveChannel, enrichedChannels } = useChannelContext();

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
  const deletingWorktree = useThreadStore((s) => s.deletingWorktree);
  const toggleReadGroup = useThreadStore((s) => s.toggleReadGroup);
  const toggleTurnGroup = useThreadStore((s) => s.toggleTurnGroup);

  // ─── Terminal store state ───────────────────────────────────────
  const terminals = useTerminalStore((s) => s.terminals);
  const allTerminalEntries = useTerminalStore((s) => s.allTerminalEntries);
  const activeTerminalTabId = useTerminalStore((s) => s.activeTabId);
  const terminalCwd = useTerminalStore((s) => s.cwd);
  const runningPtyIds = useTerminalStore((s) => s.runningPtyIds);
  const ptyProcesses = useTerminalStore((s) => s.ptyProcesses);

  // ─── UI store state ─────────────────────────────────────────────
  const isFullscreen = useAppUIStore((s) => s.isFullscreen);
  const dragging = useAppUIStore((s) => s.dragging);

  // ─── Claude run store state ────────────────────────────────────
  const pendingRunWorkspaceId = useClaudeRunStore((s) => s.pendingRunWorkspaceId);
  const pendingRunInitialPrompt = useClaudeRunStore((s) => s.pendingRunInitialPrompt);
  const clearPendingRun = useClaudeRunStore((s) => s.clearPendingRun);
  const activeRunWorkspaceIds = useClaudeRunStore((s) => s.activeRunWorkspaceIds);
  const runPendingWorkspace = useClaudeRunStore((s) => s.workspaceActions.runPendingWorkspace);
  const stopClaude = useClaudeRunStore((s) => s.workspaceActions.stopClaude);
  const sendThreadMessage = useClaudeRunStore((s) => s.workspaceActions.sendThreadMessage);
  const sendPlanResponse = useClaudeRunStore((s) => s.workspaceActions.sendPlanResponse);
  const markMerged = useClaudeRunStore((s) => s.workspaceActions.markMerged);

  // ─── Derived state ──────────────────────────────────────────────
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const kanbanColumns = useKanbanStore((s) => s.columns);

  const workspaceStatus: TicketStatus = useMemo(() => {
    const ws = workspaces.find((w) => w.id === selectedWorkspaceId);
    return (ws?.status ?? "pending") as TicketStatus;
  }, [workspaces, selectedWorkspaceId]);

  const workspaceUserId = useMemo(() => {
    const ws = workspaces.find((w) => w.id === selectedWorkspaceId);
    return ws?.userId ?? null;
  }, [workspaces, selectedWorkspaceId]);

  const ticket = useMemo(() => {
    if (!selectedWorkspaceId) return null;
    for (const col of kanbanColumns) {
      const found = col.tickets.find((t) => t.workspaceId === selectedWorkspaceId);
      if (found) return found;
    }
    return null;
  }, [kanbanColumns, selectedWorkspaceId]);

  const channelTickets = useMemo(
    () => kanbanColumns.flatMap((col) =>
      col.tickets.map((t) => ({
        workspaceId: t.workspaceId,
        title: t.title,
        status: t.workspace?.status ?? "pending",
      })),
    ),
    [kanbanColumns],
  );

  const isClaudeRunning = useMemo(() => {
    if (!selectedWorkspaceId) return false;
    if (activeRunWorkspaceIds.has(selectedWorkspaceId)) return true;
    if (!useClaudeRunStore.getState().isWorkspaceSpawned(selectedWorkspaceId)) return false;
    if (sessionStatus === "empty") return false;
    const lastEvent = sessionEvents[sessionEvents.length - 1];
    if (lastEvent?.hookEventName === "Stop") return false;
    return true;
  }, [selectedWorkspaceId, activeRunWorkspaceIds, sessionEvents, sessionStatus]);

  const pendingPromptForDisplay = useMemo(() => {
    if (pendingRunWorkspaceId === selectedWorkspaceId) return pendingRunInitialPrompt;
    return workspaces.find((w) => w.id === selectedWorkspaceId)?.preview ?? '';
  }, [pendingRunWorkspaceId, selectedWorkspaceId, pendingRunInitialPrompt, workspaces]);

  // ─── Channel-derived values ─────────────────────────────────────
  const repoPath = enrichedActiveChannel?.localRepoPath ?? "";
  const baseBranch = enrichedActiveChannel?.baseBranch ?? "main";
  const scriptsAvailable = Boolean(activeChannelId && hasWorktree === true);
  const hasSetupScript = Boolean(enrichedActiveChannel?.setupScript?.trim());
  const hasRunScript = Boolean(enrichedActiveChannel?.runScript?.trim());
  const effectiveTerminalCwd = terminalCwd || repoPath;
  const runScriptRunning = terminals.some((t) => t.name === "Run" && runningPtyIds.has(t.terminalId));

  // ─── Session nodes (derived from events) ────────────────────────
  const sessionNodes = useMemo(() => buildSessionNodes(sessionEvents), [sessionEvents]);

  // ─── Scroll ─────────────────────────────────────────────────────
  const {
    threadContentRef,
    showJumpToLatest,
    scrollThreadToBottom,
    onThreadScroll,
  } = useThreadScroll();
  const scrollToLatest = useMemo(() => () => scrollThreadToBottom("smooth"), [scrollThreadToBottom]);

  // ─── Mutations ──────────────────────────────────────────────────
  const [executeUpdateWorkspaceStatus] = useUpdateWorkspaceStatusMutation();
  const [executeHandoffWorkspace] = useHandoffWorkspaceMutation();

  // ─── Saved widths ref for fullscreen ────────────────────────────
  const savedWidthsRef = useRef({ channel: 220, thread: 0 });

  // ─── Callbacks ──────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    if (useAppUIStore.getState().isFullscreen) {
      useAppUIStore.getState().setIsFullscreen(false);
      useAppUIStore.getState().setChannelWidth(savedWidthsRef.current.channel);
      return;
    }
    useThreadStore.getState().closeThreadPanel();
  }, []);

  const handleEnterFullscreen = useCallback(async () => {
    const wsId = useThreadStore.getState().selectedWorkspaceId;
    if (!wsId || !repoPath) return;
    const result = await window.traceAPI.checkWorktreeExists(wsId, repoPath);
    if (!result.success || !result.exists || !result.worktreePath) return;

    const ui = useAppUIStore.getState();
    savedWidthsRef.current = { channel: ui.channelWidth, thread: useThreadStore.getState().threadWidth };
    useAppUIStore.getState().setChannelWidth(0);
    useAppUIStore.getState().setIsFullscreen(true);
  }, [repoPath]);

  const handleExitFullscreen = useCallback(() => {
    useAppUIStore.getState().setIsFullscreen(false);
    useAppUIStore.getState().setChannelWidth(savedWidthsRef.current.channel);
    useThreadStore.getState().setThreadWidth(savedWidthsRef.current.thread);
  }, []);

  // Exit fullscreen when worktree is deleted
  useEffect(() => {
    if (isFullscreen && hasWorktree === false) handleExitFullscreen();
  }, [handleExitFullscreen, hasWorktree, isFullscreen]);

  // Terminal initialization
  const handleInitializeTerminals = useCallback(async () => {
    const wsId = useThreadStore.getState().selectedWorkspaceId;
    if (!wsId || !activeChannelId || !repoPath) return;
    if (useTerminalStore.getState().isInitialized(wsId)) return;
    const worktreeResult = await window.traceAPI.checkWorktreeExists(wsId, repoPath);
    if (!worktreeResult.success || !worktreeResult.exists || !worktreeResult.worktreePath) return;

    const env: Record<string, string> = { REPO_FOLDER: worktreeResult.worktreePath };
    const portResult = await window.traceAPI.allocatePorts(wsId, 10);
    if (portResult.success && portResult.ports) {
      const ports = portResult.ports;
      env.PORT = String(ports[0]);
      env.TRACE_BASE_PORT = String(ports[0]);
      for (let i = 0; i < ports.length; i += 1) env[`TRACE_PORT_${i}`] = String(ports[i]);
    }

    useTerminalStore.getState().initializeDefaults(wsId, worktreeResult.worktreePath, env);
  }, [activeChannelId, repoPath]);

  useEffect(() => {
    if (hasWorktree === true && selectedWorkspaceId) void handleInitializeTerminals();
  }, [hasWorktree, selectedWorkspaceId, handleInitializeTerminals]);

  const handleDeleteWorktree = useCallback(() => {
    const wsId = useThreadStore.getState().selectedWorkspaceId;
    if (wsId) {
      useTerminalStore.getState().killAllForWorkspace(wsId);
      void window.traceAPI.releasePorts(wsId);
    }
    void useThreadStore.getState().syncActions.deleteWorktree(async (workspaceId) => {
      const chId = activeChannelId;
      if (!chId) return;
      try {
        const { data } = await executeUpdateWorkspaceStatus({
          variables: { channelId: chId, workspaceId, status: 'completed' },
        });
        if (data?.updateWorkspaceStatus) {
          useWorkspaceStore.getState().upsertWorkspace(data.updateWorkspaceStatus as import("../types").Workspace);
          useThreadStore.getState().syncSelectedWorkspace(data.updateWorkspaceStatus as import("../types").Workspace);
        }
      } catch {
        console.error('Failed to update workspace status after worktree deletion');
      }
    });
  }, [activeChannelId, executeUpdateWorkspaceStatus]);

  const handleRerunScript = useCallback(async (tabName: string) => {
    const wsId = useThreadStore.getState().selectedWorkspaceId;
    if (!wsId || !activeChannelId || !repoPath) return;
    const worktreeResult = await window.traceAPI.checkWorktreeExists(wsId, repoPath);
    if (!worktreeResult.success || !worktreeResult.exists || !worktreeResult.worktreePath) return;

    const channel = enrichedChannels.find((item) => item.id === activeChannelId);
    const script = tabName === "Setup" ? channel?.setupScript : channel?.runScript;
    if (!script?.trim()) return;

    const env: Record<string, string> = { REPO_FOLDER: worktreeResult.worktreePath };
    if (tabName === "Run") {
      await window.traceAPI.releasePorts(wsId);
      const portResult = await window.traceAPI.allocatePorts(wsId, 10);
      if (portResult.success && portResult.ports) {
        const ports = portResult.ports;
        env.PORT = String(ports[0]);
        env.TRACE_BASE_PORT = String(ports[0]);
        for (let i = 0; i < ports.length; i += 1) env[`TRACE_PORT_${i}`] = String(ports[i]);
      }
    }

    useTerminalStore.getState().rerunTab(tabName, script, env);
  }, [activeChannelId, enrichedChannels, repoPath]);

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
    async (workspaceId: string, depIds: string[], runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => {
      if (!activeChannelId) return;
      try {
        const { data } = await executeSetTicketDependencies({
          variables: { channelId: activeChannelId, workspaceId, dependsOnWorkspaceIds: depIds, runConfig },
        });
        if (data?.setTicketDependencies) {
          useWorkspaceStore.getState().upsertWorkspace(data.setTicketDependencies as import("../types").Workspace);
          useThreadStore.getState().syncSelectedWorkspace(data.setTicketDependencies as import("../types").Workspace);
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

  const handleHandoff = useCallback(async () => {
    const wsId = useThreadStore.getState().selectedWorkspaceId;
    const chId = activeChannelId;
    if (!wsId || !chId) return;

    // Stop Claude if running
    if (isClaudeRunning) {
      await window.traceAPI.stopClaude(wsId);
    }

    // Kill terminals and release ports
    useTerminalStore.getState().killAllForWorkspace(wsId);
    void window.traceAPI.releasePorts(wsId);

    // Commit any uncommitted changes so they appear in branchDiff for the next user
    await window.traceAPI.commitWorktreeChanges(wsId).catch(() => {});

    try {
      const { data } = await executeHandoffWorkspace({
        variables: { channelId: chId, workspaceId: wsId },
      });
      if (data?.handoffWorkspace) {
        const workspace = data.handoffWorkspace as import("../types").Workspace;
        useWorkspaceStore.getState().upsertWorkspace(workspace);
        useThreadStore.getState().syncSelectedWorkspace(workspace);
        useClaudeRunStore.getState().removeSpawnedWorkspace(wsId);
        useClaudeRunStore.getState().clearActiveRun(wsId);
      }
    } catch {
      console.error('Failed to hand off workspace');
    }
  }, [activeChannelId, isClaudeRunning, executeHandoffWorkspace]);

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
    if (isClaudeRunning) return null;
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
  }, [sessionNodes, isClaudeRunning]);

  const [dismissedQuestionId, setDismissedQuestionId] = useState<string | null>(
    null,
  );
  const showQuestion =
    activeQuestionNode && activeQuestionNode.id !== dismissedQuestionId
      ? activeQuestionNode
      : null;

  const activePlanNode = useMemo((): PlanReviewNode | null => {
    if (isClaudeRunning) return null;
    const last = sessionNodes[sessionNodes.length - 1];
    if (last?.kind === "plan-review") return last;
    return null;
  }, [sessionNodes, isClaudeRunning]);

  const [dismissedPlanId, setDismissedPlanId] = useState<string | null>(null);
  const showPlan =
    activePlanNode && activePlanNode.id !== dismissedPlanId
      ? activePlanNode
      : null;

  const [viewMode, setViewMode] = useState<ViewMode>("agent");

  useEffect(() => {
    setViewMode(workspaceStatus === "merged" ? "ticket" : "agent");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId]);

  const isOpen = selectedWorkspaceId !== null;

  return (
    <>
      {!isFullscreen && isOpen && (
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
        className={`flex shrink-0 min-h-0 flex-col overflow-hidden ${isOpen ? "border-l border-[#292e42]" : ""} bg-[#16161e] ${dragging ? "" : "panel-animate"}`}
        style={
          isFullscreen
            ? { flex: "1 1 0%" }
            : { width: isOpen ? `${threadWidth}px` : 0 }
        }
      >
        <ThreadHeader
          selectedWorkspaceId={selectedWorkspaceId}
          workspaceStatus={workspaceStatus}
          isClaudeRunning={isClaudeRunning}
          hasTicket={ticket !== null}
          viewMode={viewMode}
          onSetViewMode={setViewMode}
          deletingWorktree={deletingWorktree}
          hasWorktree={hasWorktree}
          worktreePath={worktreePath}
          isFullscreen={isFullscreen}
          onClose={handleClose}
          onDeleteWorktree={handleDeleteWorktree}
          canHandoff={canHandoff}
          onHandoff={() => { void handleHandoff(); }}
          onEnterFullscreen={() => { void handleEnterFullscreen(); }}
          onExitFullscreen={handleExitFullscreen}
          onMarkMerged={() => void markMerged()}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSwitchSession={switchSession}
        />

        <div className="thread-panel-shell relative flex min-h-0 flex-1">
          {viewMode === "ticket" && ticket ? (
            <TicketView ticket={ticket} />
          ) : viewMode === "files" ? (
            <WorktreeChanges
              workspaceId={selectedWorkspaceId}
              baseBranch={baseBranch}
            />
          ) : viewMode === "terminal" ? null : (
            <>
              <div
                id="thread-content"
                ref={threadContentRef}
                onScroll={onThreadScroll}
                className="thread-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3"
              >
                <div className="thread-events-list">
                  {loadingOlderEvents && (
                    <div className="py-2 text-center text-xs text-[#565f89]">
                      Loading older events...
                    </div>
                  )}
                  <ThreadStatusMessage
                    status={sessionStatus}
                    activeSessionId={activeSessionId}
                  />

                  {(() => {
                    let lastUserPromptTime: string | null = null;
                    return sessionNodes.map((node) => {
                      if (node.kind === "session-divider") {
                        return (
                          <div
                            key={node.id}
                            className="my-3 flex items-center gap-3 px-2"
                          >
                            <div className="h-px flex-1 bg-violet-500/20" />
                            <span className="text-[10px] font-medium uppercase tracking-wider text-violet-400/60">
                              New Context
                            </span>
                            <div className="h-px flex-1 bg-violet-500/20" />
                          </div>
                        );
                      }
                      if (node.kind === "readglob-group") {
                        const groupAssistantText = node.events[0]
                          ?.lastAssistantMessage
                          ? stripTraceInternal(
                              node.events[0].lastAssistantMessage,
                            ).trim()
                          : "";
                        return (
                          <React.Fragment key={node.id}>
                            {groupAssistantText && (
                              <AssistantTextRow text={groupAssistantText} />
                            )}
                            <ReadGlobGroup
                              node={node}
                              isExpanded={Boolean(
                                expandedReadGroupIds[node.id],
                              )}
                              onToggle={() => toggleReadGroup(node.id)}
                            />
                          </React.Fragment>
                        );
                      }
                      if (node.kind === "collapsed-turn") {
                        return (
                          <CollapsedTurnGroup
                            key={node.id}
                            node={node}
                            isExpanded={Boolean(expandedTurnGroupIds[node.id])}
                            onToggle={() => toggleTurnGroup(node.id)}
                            expandedReadGroupIds={expandedReadGroupIds}
                            toggleReadGroup={toggleReadGroup}
                          />
                        );
                      }
                      if (node.kind === "plan-review") {
                        return <PlanReview key={node.id} node={node} />;
                      }
                      if (node.kind === "ask-user-question") {
                        return (
                          <AskUserQuestionInline key={node.id} node={node} />
                        );
                      }
                      if (node.kind !== "event") {
                        return null;
                      }
                      if (node.event.hookEventName === "UserPromptSubmit") {
                        lastUserPromptTime = node.event.timestamp;
                      }
                      let duration: number | undefined;
                      if (
                        node.event.hookEventName === "Stop" &&
                        lastUserPromptTime
                      ) {
                        duration = Math.floor(
                          (new Date(node.event.timestamp).getTime() -
                            new Date(lastUserPromptTime).getTime()) /
                            1000,
                        );
                      }
                      return (
                        <ThreadEvent
                          key={node.event.id}
                          event={node.event}
                          duration={duration}
                        />
                      );
                    });
                  })()}
                </div>
              </div>

              <button
                type="button"
                onClick={scrollToLatest}
                className={`jump-latest-chip ${showJumpToLatest ? "visible" : ""}`}
              >
                Jump to latest
              </button>
            </>
          )}

          {/* Terminal area — always mounted to preserve PTYs across workspace/view switches */}
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            style={{ display: viewMode === "terminal" ? "flex" : "none" }}
          >
            {hasWorktree === false ? (
              <div className="flex flex-1 items-center justify-center text-sm text-[#565f89]">
                No worktree available
              </div>
            ) : allTerminalEntries.length > 0 ? (
              <TerminalTabs
                terminals={terminals}
                allTerminalEntries={allTerminalEntries}
                currentWorkspaceId={selectedWorkspaceId}
                activeTabId={activeTerminalTabId}
                cwd={effectiveTerminalCwd}
                runScriptRunning={runScriptRunning}
                scriptsAvailable={scriptsAvailable}
                hasSetupScript={hasSetupScript}
                hasRunScript={hasRunScript}
                ptyProcesses={ptyProcesses}
                onSelectTab={useTerminalStore.getState().setActiveTabId}
                onCloseTab={useTerminalStore.getState().killTerminal}
                onCloseAll={() => {
                  const wsId = useThreadStore.getState().selectedWorkspaceId;
                  if (wsId) useTerminalStore.getState().killAllForWorkspace(wsId);
                }}
                onAddTab={useTerminalStore.getState().addTerminal}
                onRunScript={() => { void handleRerunScript("Run"); }}
                onStopScript={() => handleStopScript("Run")}
                onRerunSetup={() => { void handleRerunScript("Setup"); }}
                onOpenSettings={() => { if (activeChannelId) useAppUIStore.getState().setSettingsChannelId(activeChannelId); }}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-[#565f89]">
                Initializing terminals...
              </div>
            )}
          </div>
        </div>

        {viewMode === "agent" && isClaudeRunning && latestTodos && (
          <StickyTodoList todos={latestTodos} />
        )}

        {viewMode === "agent" &&
          (isLockedByOther && workspaceStatus !== 'pending' ? (
            <div className="flex items-center justify-center border-t border-[#292e42] px-4 py-3">
              <span className="text-xs text-[#565f89]">
                Workspace locked by another user (read-only)
              </span>
            </div>
          ) : (pendingRunWorkspaceId === selectedWorkspaceId ||
            workspaceStatus === 'pending') &&
            !isClaudeRunning ? (
            <RunButtons
              initialPrompt={pendingPromptForDisplay}
              onRun={(planMode, prompt) => {
                if (pendingRunWorkspaceId !== selectedWorkspaceId && selectedWorkspaceId) {
                  useClaudeRunStore.getState().setPendingRun(selectedWorkspaceId, prompt, []);
                }
                void runPendingWorkspace(planMode, prompt);
              }}
              channelTickets={channelTickets}
              currentWorkspaceId={selectedWorkspaceId ?? pendingRunWorkspaceId}
              onRunAfter={(depIds, runConfig) => {
                const wsId = pendingRunWorkspaceId ?? selectedWorkspaceId;
                if (wsId) {
                  if (pendingRunWorkspaceId !== wsId) {
                    useClaudeRunStore.getState().setPendingRun(wsId, runConfig.prompt, []);
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
          ) : showQuestion ? (
            <AskUserQuestionBar
              node={showQuestion}
              onResponse={(text) => {
                void sendPlanResponse(text, "keep-context");
              }}
              onDismiss={() => {
                setDismissedQuestionId(showQuestion.id);
                void stopClaude();
              }}
            />
          ) : showPlan ? (
            <PlanResponseBar
              node={showPlan}
              onPlanResponse={(text, mode) => {
                setDismissedPlanId(showPlan.id);
                void sendPlanResponse(
                  text,
                  mode,
                  showPlan.planContent,
                  showPlan.planFilePath,
                );
              }}
              onDismiss={() => {
                setDismissedPlanId(showPlan.id);
                void stopClaude();
              }}
            />
          ) : (
            <ThreadInput
              isClaudeRunning={isClaudeRunning}
              lastUserMessageTime={lastUserMessageTime}
              onSendThreadMessage={sendThreadMessage}
              onStopClaude={() => void stopClaude()}
              onClearThread={clearSession}
            />
          ))}
      </div>
    </>
  );
}

function ThreadStatusMessage({
  status,
  activeSessionId,
}: {
  status: SessionStatus;
  activeSessionId: string | null;
}) {
  if (status === "loading") {
    return <div className="text-sm text-[#565f89]">Loading events...</div>;
  }
  if (status === "empty") {
    return (
      <div className="text-sm text-[#565f89]">
        {activeSessionId
          ? "No events yet"
          : "No sessions yet. Create a workspace to start."}
      </div>
    );
  }
  if (status === "error") {
    return <div className="text-sm text-red-400">Failed to load events</div>;
  }
  return null;
}
