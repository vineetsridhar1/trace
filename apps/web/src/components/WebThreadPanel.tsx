import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AskUserQuestionNode,
  PlanReviewNode,
} from '../types';
import { useThreadStore } from '../stores/threadStore';
import { useAgentRelay } from '../hooks/relay/useAgentRelay';
import { useAppendPromptMutation } from '../hooks/__generated__/useWorkspaceActions.generated';
import {
  buildSessionNodes,
  stripTraceInternal,
  ThreadEvent,
  ReadGlobGroup,
  CollapsedTurnGroup,
  PlanReview,
  AskUserQuestionInline,
  AssistantTextRow,
} from '@trace/shared-ui';
import type { PlanReviewActions, PlanResponseMode, AskUserQuestionActions, SessionRenderNode, TokenUsageInfo } from '@trace/shared-ui';
import { FiEdit3 } from 'react-icons/fi';

const NEAR_BOTTOM_THRESHOLD_PX = 100;

interface WebThreadPanelProps {
  workspaceId: string;
  channelId: string;
}

export function WebThreadPanel({ workspaceId, channelId }: WebThreadPanelProps) {
  // ─── Thread store state ─────────────────────────────────────────
  const sessions = useThreadStore((s) => s.sessions);
  const sessionEvents = useThreadStore((s) => s.sessionEvents);
  const sessionStatus = useThreadStore((s) => s.sessionStatus);
  const activeSessionId = useThreadStore((s) => s.activeSessionId);
  const loadingOlderEvents = useThreadStore((s) => s.loadingOlderEvents);
  const expandedReadGroupIds = useThreadStore((s) => s.expandedReadGroupIds);
  const expandedTurnGroupIds = useThreadStore((s) => s.expandedTurnGroupIds);
  const toggleReadGroup = useThreadStore((s) => s.toggleReadGroup);
  const toggleTurnGroup = useThreadStore((s) => s.toggleTurnGroup);
  const tokenUsage = useThreadStore((s) => s.tokenUsage);

  const { spawnAgent } = useAgentRelay();
  const [executeAppendPrompt] = useAppendPromptMutation();

  // ─── Agent run actions for interactive plan/question ────────────
  const planActions = useMemo((): PlanReviewActions => ({
    sendPlanResponse: async (text: string, mode: PlanResponseMode, planContent?: string, planFilePath?: string) => {
      if (mode === 'clear-context') {
        const prompt = planFilePath
          ? `Implement the following approved plan. The plan file is at ${planFilePath}.\n\n${planContent ?? text}`
          : `Implement the following approved plan:\n\n${planContent ?? text}`;
        const newSessionId = await useThreadStore.getState().syncActions.clearSession();
        if (!newSessionId) return;
        await executeAppendPrompt({
          variables: { channelId, workspaceId, text: prompt, sessionId: newSessionId },
        });
        await spawnAgent({ workspaceId, prompt, channelId });
      } else if (mode === 'keep-context') {
        await executeAppendPrompt({
          variables: { channelId, workspaceId, text },
        });
        await spawnAgent({ workspaceId, prompt: text, channelId });
      } else if (mode === 'revise') {
        await executeAppendPrompt({
          variables: { channelId, workspaceId, text },
        });
        await spawnAgent({ workspaceId, prompt: text, channelId, planMode: true });
      }
    },
  }), [spawnAgent, executeAppendPrompt, workspaceId, channelId]);

  const [answeredQuestionId, setAnsweredQuestionId] = useState<string | null>(null);
  const activeQuestionRef = useRef<AskUserQuestionNode | null>(null);

  const questionActions = useMemo((): AskUserQuestionActions => ({
    sendThreadMessage: async (text: string) => {
      await spawnAgent({ workspaceId, prompt: text, channelId });
    },
    onAnswered: () => {
      if (activeQuestionRef.current) {
        setAnsweredQuestionId(activeQuestionRef.current.id);
      }
    },
  }), [spawnAgent, workspaceId, channelId]);

  // ─── Session nodes (memoized on sessions + events) ─────────────
  const sessionNodes = useMemo(
    () => buildSessionNodes(sessionEvents),
    // sessions included so node list refreshes if session metadata changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, sessionEvents],
  );

  // ─── Auto-scroll ───────────────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const prevEventCountRef = useRef(0);
  const mountedWorkspaceRef = useRef<string | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const isNearBottom = useCallback((): boolean => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD_PX;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    nearBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  // Reset scroll when a new workspace is opened
  useEffect(() => {
    if (!workspaceId) return;
    if (mountedWorkspaceRef.current === workspaceId) return;
    mountedWorkspaceRef.current = workspaceId;
    nearBottomRef.current = true;
    prevEventCountRef.current = 0;
    setShowJumpToLatest(false);
    const timer = setTimeout(() => scrollToBottom('auto'), 50);
    return () => clearTimeout(timer);
  }, [workspaceId, scrollToBottom]);

  // Auto-scroll when new events arrive (only if user is near bottom)
  useEffect(() => {
    const prevCount = prevEventCountRef.current;
    const nextCount = sessionEvents.length;
    const hasNew = nextCount > prevCount;
    prevEventCountRef.current = nextCount;

    if (!hasNew) return;

    // First load — always scroll to bottom
    if (prevCount === 0) {
      requestAnimationFrame(() => scrollToBottom('auto'));
      return;
    }

    if (nearBottomRef.current) {
      requestAnimationFrame(() => {
        if (nearBottomRef.current) {
          scrollToBottom('auto');
        } else {
          setShowJumpToLatest(true);
        }
      });
      return;
    }

    setShowJumpToLatest(true);
  }, [sessionEvents, scrollToBottom]);

  const rafRef = useRef<number | null>(null);

  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const near = isNearBottom();
      nearBottomRef.current = near;
      if (near) setShowJumpToLatest(false);
    });
  }, [isNearBottom]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ─── Active question / plan detection ──────────────────────────
  const activeQuestionNode = useMemo((): AskUserQuestionNode | null => {
    for (let i = sessionNodes.length - 1; i >= 0; i--) {
      const node = sessionNodes[i];
      if (node.kind === 'ask-user-question') return node;
      if (
        node.kind === 'event' &&
        node.event.hookEventName === 'UserPromptSubmit'
      ) {
        break;
      }
    }
    return null;
  }, [sessionNodes]);

  useEffect(() => {
    activeQuestionRef.current = activeQuestionNode;
  }, [activeQuestionNode]);

  const activePlanNode = useMemo((): PlanReviewNode | null => {
    const last = sessionNodes[sessionNodes.length - 1];
    if (last?.kind === 'plan-review') return last;
    return null;
  }, [sessionNodes]);

  // ─── Loading state ─────────────────────────────────────────────
  if (sessionStatus === 'loading') {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4 w-full px-6 py-4">
          <div className="flex justify-end">
            <div className="h-8 w-2/5 rounded-lg bg-surface-elevated animate-pulse" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="h-4 w-4/5 rounded bg-surface-elevated animate-pulse" />
            <div className="h-4 w-3/5 rounded bg-surface-elevated animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-surface-elevated animate-pulse" />
          </div>
          <div className="h-6 w-1/3 rounded bg-surface-elevated animate-pulse" />
          <div className="flex flex-col gap-2">
            <div className="h-4 w-3/4 rounded bg-surface-elevated animate-pulse" />
            <div className="h-4 w-1/2 rounded bg-surface-elevated animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // ─── Empty state ───────────────────────────────────────────────
  if (sessionStatus === 'empty') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
          <FiEdit3 className="h-6 w-6 text-accent-light" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-primary">No events yet</p>
          <p className="mt-1 text-xs text-muted">
            Events will appear here once the agent starts working
          </p>
        </div>
      </div>
    );
  }

  // ─── Main render ───────────────────────────────────────────────
  return (
    <div className="relative flex flex-1 flex-col min-h-0">
      {/* Scrollable event list */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="thread-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        <div className="thread-events-list">
          {loadingOlderEvents && (
            <div className="py-2 text-center text-xs text-muted">
              Loading older events...
            </div>
          )}

          <ThreadStatusMessage
            status={sessionStatus}
            activeSessionId={activeSessionId}
          />

          <SessionNodeList
            sessionNodes={sessionNodes}
            expandedReadGroupIds={expandedReadGroupIds}
            expandedTurnGroupIds={expandedTurnGroupIds}
            toggleReadGroup={toggleReadGroup}
            toggleTurnGroup={toggleTurnGroup}
            questionActions={questionActions}
            tokenUsage={tokenUsage}
            answeredQuestionId={answeredQuestionId}
          />
        </div>
      </div>

      {/* Jump to latest */}
      <button
        type="button"
        onClick={() => scrollToBottom('smooth')}
        className={`jump-latest-chip ${showJumpToLatest ? 'visible' : ''}`}
      >
        Jump to latest
      </button>

      {/* Pinned interactive bars */}
      {activePlanNode && (
        <div className="border-t border-edge max-h-[50vh] overflow-y-auto">
          <PlanReview node={activePlanNode} actions={planActions} />
        </div>
      )}
      {activeQuestionNode && activeQuestionNode.id !== answeredQuestionId && (
        <div className="border-t border-edge">
          <AskUserQuestionInline node={activeQuestionNode} actions={questionActions} />
        </div>
      )}
    </div>
  );
}

// ─── Memoized session node list ───────────────────────────────────

const SessionNodeList = React.memo(function SessionNodeList({
  sessionNodes,
  expandedReadGroupIds,
  expandedTurnGroupIds,
  toggleReadGroup,
  toggleTurnGroup,
  questionActions,
  tokenUsage,
  answeredQuestionId,
}: {
  sessionNodes: SessionRenderNode[];
  expandedReadGroupIds: Record<string, boolean>;
  expandedTurnGroupIds: Record<string, boolean>;
  toggleReadGroup: (id: string) => void;
  toggleTurnGroup: (id: string) => void;
  questionActions: AskUserQuestionActions;
  tokenUsage: TokenUsageInfo | null;
  answeredQuestionId: string | null;
}) {
  let lastUserPromptTime: string | null = null;
  return (
    <>
      {sessionNodes.map((node) => {
        if (node.kind === 'session-divider') {
          return (
            <div
              key={node.id}
              className="my-3 flex items-center gap-3 px-2"
            >
              <div className="h-px flex-1 bg-accent/20" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-accent-light/60">
                New Context
              </span>
              <div className="h-px flex-1 bg-accent/20" />
            </div>
          );
        }
        if (node.kind === 'readglob-group') {
          const groupAssistantText = node.events[0]?.lastAssistantMessage
            ? stripTraceInternal(
                node.events[0].lastAssistantMessage,
              ).trim()
            : '';
          return (
            <React.Fragment key={node.id}>
              {groupAssistantText && (
                <AssistantTextRow text={groupAssistantText} />
              )}
              <ReadGlobGroup
                node={node}
                isExpanded={Boolean(expandedReadGroupIds[node.id])}
                onToggle={() => toggleReadGroup(node.id)}
              />
            </React.Fragment>
          );
        }
        if (node.kind === 'collapsed-turn') {
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
        if (node.kind === 'plan-review') {
          return <PlanReview key={node.id} node={node} />;
        }
        if (node.kind === 'ask-user-question') {
          return <AskUserQuestionInline key={node.id} node={node} actions={questionActions} isAnswered={node.id === answeredQuestionId} />;
        }
        if (node.kind !== 'event') return null;

        if (node.event.hookEventName === 'UserPromptSubmit') {
          lastUserPromptTime = node.event.timestamp;
        }
        let duration: number | undefined;
        if (
          node.event.hookEventName === 'Stop' &&
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
            tokenUsage={tokenUsage}
          />
        );
      })}
    </>
  );
});

// ─── Thread status message (error state) ─────────────────────────

function ThreadStatusMessage({
  status,
  activeSessionId,
}: {
  status: string;
  activeSessionId: string | null;
}) {
  if (status === 'error') {
    return <div className="text-sm text-red-400">Failed to load events</div>;
  }
  return null;
}
