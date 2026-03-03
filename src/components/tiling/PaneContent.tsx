import React from 'react';
import type {
  SessionStatus,
  KanbanTicket,
} from '../../types';
import type { SessionRenderNode } from '../../types';
import { stripTraceInternal } from '../../utils';
import { ThreadEvent, PlanReview, AskUserQuestionInline } from '../ThreadEvent';
import { ReadGlobGroup } from '../ReadGlobGroup';
import { CollapsedTurnGroup } from '../CollapsedTurnGroup';
import { AssistantTextRow } from '../thread-events/AssistantTextRow';
import { TicketView } from '../TicketView';
import { WorktreeChanges } from '../WorktreeChanges';

// ─── Agent content (the thread scroll) ──────────────────────────

interface AgentContentProps {
  threadContentRef: React.RefObject<HTMLDivElement | null>;
  onThreadScroll: () => void;
  sessionNodes: SessionRenderNode[];
  sessionStatus: SessionStatus;
  activeSessionId: string | null;
  loadingOlderEvents: boolean;
  expandedReadGroupIds: Record<string, boolean>;
  expandedTurnGroupIds: Record<string, boolean>;
  toggleReadGroup: (id: string) => void;
  toggleTurnGroup: (id: string) => void;
  showJumpToLatest: boolean;
  scrollToLatest: () => void;
}

export function AgentContent({
  threadContentRef,
  onThreadScroll,
  sessionNodes,
  sessionStatus,
  activeSessionId,
  loadingOlderEvents,
  expandedReadGroupIds,
  expandedTurnGroupIds,
  toggleReadGroup,
  toggleTurnGroup,
  showJumpToLatest,
  scrollToLatest,
}: AgentContentProps) {
  return (
    <>
      <div
        id="thread-content"
        ref={threadContentRef}
        onScroll={onThreadScroll}
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

          {(() => {
            let lastUserPromptTime: string | null = null;
            return sessionNodes.map((node) => {
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
                const groupAssistantText = node.events[0]
                  ?.lastAssistantMessage
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
                      isExpanded={Boolean(
                        expandedReadGroupIds[node.id],
                      )}
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
                return (
                  <AskUserQuestionInline key={node.id} node={node} />
                );
              }
              if (node.kind !== 'event') {
                return null;
              }
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
                />
              );
            });
          })()}
        </div>
      </div>

      <button
        type="button"
        onClick={scrollToLatest}
        className={`jump-latest-chip ${showJumpToLatest ? 'visible' : ''}`}
      >
        Jump to latest
      </button>
    </>
  );
}

// ─── Ticket content ──────────────────────────────────────────────

interface TicketContentProps {
  ticket: KanbanTicket | null;
}

export function TicketContent({ ticket }: TicketContentProps) {
  if (ticket) return <TicketView ticket={ticket} />;
  return <TicketViewSkeleton />;
}

// ─── Files content ───────────────────────────────────────────────

interface FilesContentProps {
  workspaceId: string | null;
  baseBranch: string;
}

export function FilesContent({ workspaceId, baseBranch }: FilesContentProps) {
  return <WorktreeChanges workspaceId={workspaceId} baseBranch={baseBranch} />;
}

// ─── Thread status message ──────────────────────────────────────

function ThreadStatusMessage({
  status,
  activeSessionId,
}: {
  status: SessionStatus;
  activeSessionId: string | null;
}) {
  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4 w-full px-2">
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
    );
  }
  if (status === 'empty') {
    return (
      <div className="text-sm text-muted">
        {activeSessionId
          ? 'No events yet'
          : 'No sessions yet.'}
      </div>
    );
  }
  if (status === 'error') {
    return <div className="text-sm text-red-400">Failed to load events</div>;
  }
  return null;
}

function TicketViewSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
      <div className="h-6 w-3/4 rounded bg-[#292e42] animate-pulse" />
      <div className="mt-3 flex gap-2">
        <div className="h-5 w-16 rounded-full bg-[#292e42] animate-pulse" />
        <div className="h-5 w-20 rounded-full bg-[#292e42] animate-pulse" />
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <div className="h-4 w-full rounded bg-[#292e42] animate-pulse" />
        <div className="h-4 w-5/6 rounded bg-[#292e42] animate-pulse" />
        <div className="h-4 w-4/6 rounded bg-[#292e42] animate-pulse" />
        <div className="h-4 w-3/4 rounded bg-[#292e42] animate-pulse" />
      </div>
    </div>
  );
}
