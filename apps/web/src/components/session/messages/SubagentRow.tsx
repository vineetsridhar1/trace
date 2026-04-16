import { useState } from "react";
import type { GitCheckpoint } from "@trace/gql";
import { Cpu, Check, ChevronRight, Loader2 } from "lucide-react";
import { useScopedEventIdsByParentId } from "../../../stores/entity";
import { SessionMessage } from "../SessionMessage";
import type { AgentToolResult } from "../groupReadGlob";
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
  /** tool_use id of the Agent call — used to fetch nested child events. */
  toolUseId?: string;
  scopeKey?: string;
  gitCheckpointsByPromptEventId?: Map<string, GitCheckpoint[]>;
  completedAgentTools?: Map<string, AgentToolResult>;
}

const EMPTY_CHECKPOINTS: Map<string, GitCheckpoint[]> = new Map();
const EMPTY_AGENT_TOOLS: Map<string, AgentToolResult> = new Map();

export function SubagentRow({
  description,
  subagentType,
  isLoading,
  result,
  rawResponse,
  timestamp,
  toolUseId,
  scopeKey,
  gitCheckpointsByPromptEventId,
  completedAgentTools,
}: SubagentRowProps) {
  const [expanded, setExpanded] = useState(false);
  const style = getTypeStyle(subagentType);
  const childEventIds = useScopedEventIdsByParentId(scopeKey ?? "", toolUseId);
  const stepCount = childEventIds.length;
  const canExpand = stepCount > 0 || !!result || !!rawResponse;

  return (
    <div className="activity-row overflow-hidden">
      <button
        type="button"
        disabled={!canExpand}
        className={`flex w-full items-center gap-2 text-left ${canExpand ? "cursor-pointer" : "cursor-default"}`}
        onClick={canExpand ? () => setExpanded(!expanded) : undefined}
      >
        <Cpu className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${style.text} ${style.bg}`}>
          {subagentType}
        </span>

        <span className="flex-1 truncate text-xs text-foreground">{description}</span>

        {stepCount > 0 && (
          <span className="text-[10px] text-muted-foreground shrink-0">
            {stepCount} {stepCount === 1 ? "step" : "steps"}
          </span>
        )}

        {isLoading ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-accent" />
        ) : (
          <Check className="h-3 w-3 shrink-0 text-green-400" />
        )}

        <span className="text-[10px] text-muted-foreground">{formatTime(timestamp)}</span>

        {canExpand && (
          <ChevronRight
            className="h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150"
            style={{ transform: expanded ? "rotate(90deg)" : undefined }}
          />
        )}
      </button>

      {expanded && (
        <div className="mt-2 border-l border-border/40 pl-3 space-y-1">
          {childEventIds.map((childId) => (
            <SessionMessage
              key={childId}
              id={childId}
              gitCheckpointsByPromptEventId={gitCheckpointsByPromptEventId ?? EMPTY_CHECKPOINTS}
              completedAgentTools={completedAgentTools ?? EMPTY_AGENT_TOOLS}
            />
          ))}
          {!isLoading && (result != null || rawResponse != null) && (
            <pre className="subagent-result-pre text-foreground mt-2">
              {result
                ? result.length > 3000 ? `${result.slice(0, 3000)}...` : result
                : serializeUnknown(rawResponse, 2000)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
