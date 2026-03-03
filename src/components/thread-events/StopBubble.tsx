import { memo, useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ServerEvent } from '../../types';
import type { TokenUsageInfo } from '../../hooks/useThread';
import { formatDuration, stripTraceInternal } from '../../utils';
import { useThreadStore } from '../../stores/threadStore';
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
        <span>{tokenUsage.cliCostUsd != null ? `$${tokenUsage.cliCostUsd.toFixed(2)}` : '—'}</span>
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
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
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
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
      Copy
    </button>
  );
}

export const StopBubble = memo(function StopBubble({
  event,
  time,
  duration,
}: {
  event: ServerEvent;
  time: string;
  duration?: number;
}) {
  const tokenUsage = useThreadStore((s) => s.tokenUsage);
  const message = event.lastAssistantMessage ? stripTraceInternal(event.lastAssistantMessage) : '';
  const stopReason = (event.rawPayload as Record<string, unknown>)?.stop_reason;
  const isUserStop = stopReason === 'user';
  const displayMessage = message || 'Claude completed the run.';

  if (isUserStop) {
    return (
      <div className="flex items-center gap-1.5 py-0.5 px-1 pl-0.5 opacity-45">
        <span className="text-red-400 text-[8px] leading-none">&#9632;</span>
        <span className="text-muted text-[11px] font-normal">Stopped by user</span>
        <span className="activity-row-time">{time}</span>
      </div>
    );
  }

  return (
    <div className="activity-row">
      <div className="activity-row-header">
        <span className="activity-row-icon">&#9632;</span>
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
