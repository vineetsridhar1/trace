import { useState } from "react";
import { Cpu, Check, ChevronRight, Loader2 } from "lucide-react";
import { formatTime, serializeUnknown } from "./utils";

const TYPE_COLORS: Record<string, { text: string; bg: string }> = {
  Explore: { text: "text-cyan-300", bg: "bg-cyan-400/10" },
  Plan: { text: "text-amber-300", bg: "bg-amber-400/10" },
  "general-purpose": { text: "text-accent", bg: "bg-accent/10" },
};

function getTypeStyle(type: string) {
  return TYPE_COLORS[type] ?? { text: "text-foreground", bg: "bg-muted/10" };
}

export interface SubagentRowProps {
  key?: React.Key;
  description: string;
  subagentType: string;
  isLoading: boolean;
  result?: string;
  rawResponse?: unknown;
  timestamp: string;
}

export function SubagentRow({
  description,
  subagentType,
  isLoading,
  result,
  rawResponse,
  timestamp,
}: SubagentRowProps) {
  const [expanded, setExpanded] = useState(false);
  const style = getTypeStyle(subagentType);

  return (
    <div className="activity-row overflow-hidden">
      <button
        type="button"
        disabled={isLoading}
        className={`flex w-full items-center gap-2 text-left ${isLoading ? "cursor-default" : "cursor-pointer"}`}
        onClick={isLoading ? undefined : () => setExpanded(!expanded)}
      >
        <Cpu className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${style.text} ${style.bg}`}>
          {subagentType}
        </span>

        <span className="flex-1 truncate text-xs text-foreground">{description}</span>

        {isLoading ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
        ) : (
          <Check className="h-3 w-3 shrink-0 text-green-400" />
        )}

        <span className="text-[10px] text-muted-foreground">{formatTime(timestamp)}</span>

        {!isLoading && (
          <ChevronRight
            className="h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150"
            style={{ transform: expanded ? "rotate(90deg)" : undefined }}
          />
        )}
      </button>

      {!isLoading && expanded && (
        <pre className="subagent-result-pre text-foreground">
          {result
            ? result.length > 3000 ? `${result.slice(0, 3000)}...` : result
            : serializeUnknown(rawResponse, 2000)}
        </pre>
      )}
    </div>
  );
}
