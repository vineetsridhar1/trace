import { memo } from "react";
import ReactMarkdown from "react-markdown";
import { MARKDOWN_COMPONENTS } from '@trace/shared-ui';
import remarkGfm from "remark-gfm";
import type { ServerEvent } from "../../types";
import type { TokenUsageInfo } from "../../hooks/useThread";
import { formatDuration, stripTraceInternal } from "../../utils";
import { useThreadStore } from "../../stores/threadStore";
import { Tooltip } from "../Tooltip";
import { CopyMessageButton } from "./CopyMessageButton";

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
        <span>
          {tokenUsage.cliCostUsd != null
            ? `$${tokenUsage.cliCostUsd.toFixed(2)}`
            : "—"}
        </span>
      </div>
    </div>
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
  const message = event.lastAssistantMessage
    ? stripTraceInternal(event.lastAssistantMessage)
    : "";
  const stopReason = (event.rawPayload as Record<string, unknown>)?.stop_reason;
  const isUserStop = stopReason === "user";
  const displayMessage = message || "Claude completed the run.";

  if (isUserStop) {
    return (
      <div className="flex items-center gap-1.5 py-0.5 px-1 pl-0.5 opacity-45">
        <span className="text-red-400 text-[8px] leading-none">&#9632;</span>
        <span className="text-muted text-[11px] font-normal">
          Stopped by user
        </span>
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
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {displayMessage}
          </ReactMarkdown>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        {duration != null && (
          <Tooltip
            text={
              tokenUsage && tokenUsage.totalTokens > 0 ? (
                <TokenUsageTooltip tokenUsage={tokenUsage} />
              ) : null
            }
          >
            <span className="text-[11px] text-muted">
              {formatDuration(duration)}
            </span>
          </Tooltip>
        )}
        {message && <CopyMessageButton text={message} />}
      </div>
    </div>
  );
});
