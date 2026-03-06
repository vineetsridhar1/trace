import { useState } from 'react';
import { FiCpu, FiCheck, FiChevronRight, FiLoader } from 'react-icons/fi';
import type { ServerEvent } from '../types';
import { formatTime, formatTokens, serializeUnknown } from '../utils';
import { ElapsedTimer } from './ElapsedTimer';

interface SubagentInput {
  description?: string;
  subagent_type?: string;
  prompt?: string;
}

interface SubagentResponse {
  agentId?: string;
  status?: string;
  content?: Array<{ text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    duration_ms?: number;
    tool_uses?: number;
  };
}

const TYPE_COLORS: Record<string, { text: string; bg: string }> = {
  Explore: { text: 'text-cyan-300', bg: 'bg-cyan-400/10' },
  Plan: { text: 'text-amber-300', bg: 'bg-amber-400/10' },
  'general-purpose': { text: 'text-accent-light', bg: 'bg-accent-light/10' },
};

function getTypeStyle(subagentType: string) {
  return TYPE_COLORS[subagentType] ?? { text: 'text-primary', bg: 'bg-[#a1a1aa]/10' };
}

export function SubagentRow({ event }: { event: ServerEvent }) {
  const [expanded, setExpanded] = useState(false);

  const isLoading = event.hookEventName === 'PreToolUse';
  const input = (event.toolInput ?? {}) as SubagentInput;
  const response = (event.toolResponse ?? {}) as SubagentResponse;

  const description = input.description ?? 'Subagent';
  const subagentType = input.subagent_type ?? 'agent';
  const status = response.status ?? 'completed';
  const isCompleted = !isLoading && status === 'completed';

  const resultText = response.content
    ?.map((block) => block.text)
    .filter(Boolean)
    .join('\n');

  const usage = response.usage;
  const time = formatTime(event.timestamp);
  const style = getTypeStyle(subagentType);

  return (
    <div className="activity-row overflow-hidden">
      <button
        type="button"
        disabled={isLoading}
        className={`flex w-full items-center gap-2 text-left${isLoading ? ' cursor-default' : ' cursor-pointer'}`}
        onClick={isLoading ? undefined : () => setExpanded(!expanded)}
      >
        <FiCpu className="h-3.5 w-3.5 flex-shrink-0 text-muted" />

        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${style.text} ${style.bg}`}>
          {subagentType}
        </span>

        <span className="flex-1 truncate text-xs text-primary">{description}</span>

        {isLoading ? (
          <FiLoader className="h-3 w-3 flex-shrink-0 animate-spin text-accent-light" />
        ) : isCompleted ? (
          <FiCheck className="h-3 w-3 flex-shrink-0 text-green-400" />
        ) : null}

        {!isLoading && usage && (
          <span className="text-[10px] text-muted">
            {formatTokens((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0))} tokens
          </span>
        )}

        {isLoading ? (
          <ElapsedTimer startTime={event.timestamp} />
        ) : (
          <span className="text-[10px] text-muted">{time}</span>
        )}

        {!isLoading && (
          <FiChevronRight
            className="h-3 w-3 flex-shrink-0 text-muted transition-transform duration-150"
            style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
          />
        )}
      </button>

      {!isLoading && expanded && (
        <div>
          {resultText ? (
            <pre className="subagent-result-pre text-primary">
              {resultText.length > 3000 ? `${resultText.slice(0, 3000)}...` : resultText}
            </pre>
          ) : (
            <pre className="subagent-result-pre text-muted">
              {serializeUnknown(event.toolResponse, 2000)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
