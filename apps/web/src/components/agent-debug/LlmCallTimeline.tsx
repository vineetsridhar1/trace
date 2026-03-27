import { useState } from "react";
import { ChevronDown, ChevronRight, Clock, Cpu, DollarSign, ArrowDownUp } from "lucide-react";
import { cn } from "../../lib/utils";
import { LlmCallDetail, type LlmCallData } from "./LlmCallDetail";

function TimelineEntry({ call }: { call: LlmCallData }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative pl-8">
      {/* Timeline dot */}
      <div className="absolute left-0 top-0 flex items-center justify-center w-6 h-6 rounded-full bg-muted border border-border text-xs font-bold text-foreground">
        {call.turnNumber}
      </div>
      {/* Connector line */}
      <div className="absolute left-3 top-6 bottom-0 w-px bg-border" />

      <div className={cn("rounded-lg border border-border mb-3", expanded && "bg-muted/30")}>
        {/* Header */}
        <button
          className="flex items-center gap-3 w-full px-3 py-2 hover:bg-muted/50 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={14} className="text-muted-foreground shrink-0" /> : <ChevronRight size={14} className="text-muted-foreground shrink-0" />}
          <span className="text-xs font-mono text-foreground truncate">{call.model}</span>
          <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground shrink-0">
            <span className="flex items-center gap-1" title="Tokens (in/out)">
              <ArrowDownUp size={12} />
              {call.inputTokens.toLocaleString()}/{call.outputTokens.toLocaleString()}
            </span>
            <span className="flex items-center gap-1" title="Cost">
              <DollarSign size={12} />
              {call.estimatedCostCents.toFixed(3)}c
            </span>
            <span className="flex items-center gap-1" title="Latency">
              <Clock size={12} />
              {call.latencyMs.toLocaleString()}ms
            </span>
            <span className="flex items-center gap-1" title="Provider">
              <Cpu size={12} />
              {call.provider}
            </span>
          </div>
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="px-3 pb-3 border-t border-border">
            <div className="mt-3">
              <LlmCallDetail call={call} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function LlmCallTimeline({ calls }: { calls: LlmCallData[] }) {
  if (calls.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface-deep p-4 text-center">
        <p className="text-xs text-muted-foreground">No per-call data available for this execution</p>
      </div>
    );
  }

  const totalTokensIn = calls.reduce((s, c) => s + c.inputTokens, 0);
  const totalTokensOut = calls.reduce((s, c) => s + c.outputTokens, 0);
  const totalCost = calls.reduce((s, c) => s + c.estimatedCostCents, 0);

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        <span>{calls.length} turn{calls.length !== 1 ? "s" : ""}</span>
        <span className="flex items-center gap-1">
          <ArrowDownUp size={12} />
          {totalTokensIn.toLocaleString()} in / {totalTokensOut.toLocaleString()} out
        </span>
        <span className="flex items-center gap-1">
          <DollarSign size={12} />
          {totalCost.toFixed(3)} cents total
        </span>
      </div>

      {/* Timeline */}
      <div className="relative">
        {calls.map((call) => (
          <TimelineEntry key={call.id} call={call} />
        ))}
      </div>
    </div>
  );
}
