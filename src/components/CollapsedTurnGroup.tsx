import React from 'react';
import { FiTerminal } from 'react-icons/fi';
import type { CollapsedTurnGroupNode } from '../types';
import { ThreadEvent, PlanReview, AskUserQuestionInline } from './ThreadEvent';
import { ReadGlobGroup } from './ReadGlobGroup';
import { AssistantTextRow } from './thread-events/AssistantTextRow';
import { stripTraceInternal } from '../utils';

interface CollapsedTurnGroupProps {
  node: CollapsedTurnGroupNode;
  isExpanded: boolean;
  onToggle: () => void;
  expandedReadGroupIds: Record<string, boolean>;
  toggleReadGroup: (groupId: string) => void;
}

function buildSummary(node: CollapsedTurnGroupNode): string {
  const parts: string[] = [];
  if (node.toolCallCount > 0) {
    parts.push(`${node.toolCallCount} tool ${node.toolCallCount === 1 ? 'call' : 'calls'}`);
  }
  if (node.messageCount > 0) {
    parts.push(`${node.messageCount} ${node.messageCount === 1 ? 'message' : 'messages'}`);
  }
  if (parts.length === 0) {
    parts.push(`${node.stepCount} ${node.stepCount === 1 ? 'step' : 'steps'}`);
  }
  return parts.join(', ');
}

export function CollapsedTurnGroup({
  node,
  isExpanded,
  onToggle,
  expandedReadGroupIds,
  toggleReadGroup,
}: CollapsedTurnGroupProps) {
  return (
    <div className="activity-row">
      <button
        type="button"
        onClick={onToggle}
        className="activity-row-header w-full cursor-pointer text-left"
      >
        <span className={`collapsed-turn-chevron text-[10px] text-[#7f8bbf] ${isExpanded ? 'open' : ''}`}>
          ▶
        </span>
        {node.toolCallCount > 0 && (
          <FiTerminal className="text-[12px] text-[#6472a7] shrink-0" />
        )}
        <span className="activity-row-title opacity-60 font-light">
          {buildSummary(node)}
        </span>
      </button>

      <div className={`collapsed-turn-body ${isExpanded ? 'open' : ''}`}>
        <div className="space-y-3 pt-1">
          {node.innerNodes.map((inner) => {
            if (inner.kind === 'session-divider') {
              return (
                <div key={inner.id} className="my-3 flex items-center gap-3 px-2">
                  <div className="h-px flex-1 bg-violet-500/20" />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-violet-400/60">
                    New Context
                  </span>
                  <div className="h-px flex-1 bg-violet-500/20" />
                </div>
              );
            }
            if (inner.kind === 'readglob-group') {
              const groupAssistantText = inner.events[0]?.lastAssistantMessage
                ? stripTraceInternal(inner.events[0].lastAssistantMessage).trim()
                : '';
              return (
                <React.Fragment key={inner.id}>
                  {groupAssistantText && <AssistantTextRow text={groupAssistantText} />}
                  <ReadGlobGroup
                    node={inner}
                    isExpanded={Boolean(expandedReadGroupIds[inner.id])}
                    onToggle={() => toggleReadGroup(inner.id)}
                  />
                </React.Fragment>
              );
            }
            if (inner.kind === 'plan-review') {
              return <PlanReview key={inner.id} node={inner} />;
            }
            if (inner.kind === 'ask-user-question') {
              return <AskUserQuestionInline key={inner.id} node={inner} />;
            }
            if (inner.kind === 'event') {
              return <ThreadEvent key={inner.event.id} event={inner.event} />;
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}
