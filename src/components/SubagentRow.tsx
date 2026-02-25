import { useState, useRef, useEffect } from 'react';
import { FiCpu, FiCheck, FiChevronRight } from 'react-icons/fi';
import type { ServerEvent } from '../types';
import { formatTime, formatTokens, serializeUnknown } from '../utils';

interface SubagentInput {
  description?: string;
  subagent_type?: string;
  prompt?: string;
}

interface SubagentUsage {
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
  tool_uses?: number;
}

interface SubagentResponse {
  agentId?: string;
  status?: string;
  content?: Array<{ text?: string }>;
  usage?: SubagentUsage;
}

const TYPE_COLORS: Record<string, { text: string; bg: string }> = {
  Explore: { text: 'text-cyan-300', bg: 'bg-cyan-400/10' },
  Plan: { text: 'text-amber-300', bg: 'bg-amber-400/10' },
  'general-purpose': { text: 'text-violet-300', bg: 'bg-violet-400/10' },
};

function getTypeStyle(subagentType: string) {
  return TYPE_COLORS[subagentType] ?? { text: 'text-[#a9b1d6]', bg: 'bg-[#a9b1d6]/10' };
}

export function SubagentRow({ event }: { event: ServerEvent }) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(0);

  const input = (event.toolInput ?? {}) as SubagentInput;
  const response = (event.toolResponse ?? {}) as SubagentResponse;

  const description = input.description ?? 'Subagent';
  const subagentType = input.subagent_type ?? 'agent';
  const status = response.status ?? 'completed';
  const isCompleted = status === 'completed';

  const resultText = response.content
    ?.map((block) => block.text)
    .filter(Boolean)
    .join('\n');

  const usage = response.usage;
  const time = formatTime(event.timestamp);
  const style = getTypeStyle(subagentType);

  useEffect(() => {
    if (bodyRef.current) {
      setBodyHeight(bodyRef.current.scrollHeight);
    }
  }, [expanded, resultText]);

  return (
    <div className="activity-row">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <FiCpu className="h-3.5 w-3.5 flex-shrink-0 text-[#565f89]" />

        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${style.text} ${style.bg}`}>
          {subagentType}
        </span>

        <span className="flex-1 truncate text-xs text-[#a9b1d6]">{description}</span>

        {isCompleted && (
          <FiCheck className="h-3 w-3 flex-shrink-0 text-green-400" />
        )}

        {usage && (
          <span className="text-[10px] text-[#565f89]">
            {formatTokens((usage.input_tokens ?? 0) + (usage.output_tokens ?? 0))} tokens
          </span>
        )}

        <span className="text-[10px] text-[#565f89]">{time}</span>

        <FiChevronRight
          className="h-3 w-3 flex-shrink-0 text-[#565f89] transition-transform duration-150"
          style={{ transform: expanded ? 'rotate(90deg)' : undefined }}
        />
      </button>

      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{ maxHeight: expanded ? `${bodyHeight}px` : '0px' }}
      >
        <div ref={bodyRef}>
          {resultText ? (
            <pre className="mt-1.5 max-h-60 overflow-auto whitespace-pre-wrap rounded border border-[#292e42] bg-[#1a1b26] p-2 text-[11px] leading-relaxed text-[#9aa5ce]">
              {resultText.length > 3000 ? `${resultText.slice(0, 3000)}...` : resultText}
            </pre>
          ) : (
            <pre className="mt-1.5 rounded border border-[#292e42] bg-[#1a1b26] p-2 text-[11px] text-[#565f89]">
              {serializeUnknown(event.toolResponse, 2000)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
