import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { FiCopy, FiCheck, FiSquare } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ServerEvent, TokenUsageInfo } from '../../types';
import { stripTraceInternal, formatDuration } from '../../utils';
import { Tooltip } from '../Tooltip';

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function TokenUsageTooltip({ tokenUsage }: { tokenUsage: TokenUsageInfo }) {
  return (
    <div className="w-48 whitespace-normal">
      <div className="border-b border-edge pb-1.5 mb-1.5">
        <div className="flex justify-between">
          <span className="text-muted">Input</span>
          <span>{formatNumber(tokenUsage.inputTokens)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Output</span>
          <span>{formatNumber(tokenUsage.outputTokens)}</span>
        </div>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Cost</span>
        <span>{tokenUsage.cliCostUsd != null ? `$${tokenUsage.cliCostUsd.toFixed(2)}` : '\u2014'}</span>
      </div>
    </div>
  );
}

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [text]);

  if (copied) {
    return (
      <button type="button" className="flex items-center gap-1 text-green-400 text-[11px]" disabled>
        <FiCheck size={12} />
        Copied
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy message"
      className="flex cursor-pointer items-center gap-1 text-[11px] text-muted transition-colors hover:text-primary"
    >
      <FiCopy size={12} />
      Copy
    </button>
  );
}

export const StopBubble = memo(function StopBubble({
  event,
  time,
  duration,
  tokenUsage,
}: {
  event: ServerEvent;
  time: string;
  duration?: number;
  tokenUsage?: TokenUsageInfo | null;
}) {
  const message = event.lastAssistantMessage ? stripTraceInternal(event.lastAssistantMessage) : '';
  const stopReason = (event.rawPayload as Record<string, unknown>)?.stop_reason;
  const isUserStop = stopReason === 'user';
  const displayMessage = message || 'Claude completed the run.';

  if (isUserStop) {
    return (
      <div className="flex items-center gap-1.5 py-0.5 px-1 pl-0.5 opacity-45">
        <FiSquare className="text-red-400" size={8} />
        <span className="text-muted text-[11px] font-normal">Stopped by user</span>
        <span className="activity-row-time">{time}</span>
      </div>
    );
  }

  return (
    <div className="activity-row">
      <div className="activity-row-header">
        <span className="activity-row-icon"><FiSquare size={10} /></span>
        <span className="activity-row-title">Run ended</span>
        <span className="activity-row-time">{time}</span>
      </div>
      <div className="activity-row-note">
        <div className="markdown-body break-words text-sm text-primary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayMessage}</ReactMarkdown>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        {duration != null && (
          <Tooltip
            text={tokenUsage && tokenUsage.totalTokens > 0
              ? <TokenUsageTooltip tokenUsage={tokenUsage} />
              : null}
          >
            <span className="text-[11px] text-muted">{formatDuration(duration)}</span>
          </Tooltip>
        )}
        {message && <CopyMessageButton text={message} />}
      </div>
    </div>
  );
});
