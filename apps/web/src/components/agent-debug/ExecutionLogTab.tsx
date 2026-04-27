import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { ExecutionDetailView } from "./ExecutionDetailView";

const EXECUTION_LOGS_QUERY = gql`
  query AgentExecutionLogs($organizationId: ID!, $filters: ExecutionLogFilters) {
    agentExecutionLogs(organizationId: $organizationId, filters: $filters) {
      items {
        id
        triggerEventId
        batchSize
        agentId
        modelTier
        model
        promoted
        promotionReason
        inputTokens
        outputTokens
        estimatedCostCents
        disposition
        confidence
        status
        latencyMs
        createdAt
      }
      totalCount
    }
  }
`;

interface ExecutionLogItem {
  id: string;
  triggerEventId: string;
  batchSize: number;
  agentId: string;
  modelTier: string;
  model: string;
  promoted: boolean;
  promotionReason: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  disposition: string;
  confidence: number;
  status: string;
  latencyMs: number;
  createdAt: string;
}

const PAGE_SIZE = 25;

const STATUS_COLORS: Record<string, string> = {
  succeeded: "text-green-500",
  suggested: "text-blue-500",
  blocked: "text-yellow-500",
  dropped: "text-muted-foreground",
  failed: "text-red-500",
};

const DISPOSITION_LABELS: Record<string, string> = {
  ignore: "Ignore",
  suggest: "Suggest",
  act: "Act",
  summarize: "Summarize",
  escalate: "Escalate",
};

export function ExecutionLogTab() {
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const [logs, setLogs] = useState<ExecutionLogItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    const filters: Record<string, unknown> = {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    };
    if (statusFilter !== "all") {
      filters.status = statusFilter;
    }
    const result = await client
      .query(EXECUTION_LOGS_QUERY, { organizationId: activeOrgId, filters })
      .toPromise();
    if (result.data?.agentExecutionLogs) {
      setLogs(result.data.agentExecutionLogs.items as ExecutionLogItem[]);
      setTotalCount(result.data.agentExecutionLogs.totalCount as number);
    }
    setLoading(false);
  }, [activeOrgId, page, statusFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (selectedLogId) {
    return <ExecutionDetailView logId={selectedLogId} onBack={() => setSelectedLogId(null)} />;
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">Execution Logs</h2>
          <span className="text-xs text-muted-foreground">{totalCount} total</span>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onValueChange={(v: string | null) => {
              if (v) {
                setStatusFilter(v);
                setPage(0);
              }
            }}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="succeeded">Succeeded</SelectItem>
              <SelectItem value="suggested">Suggested</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="dropped">Dropped</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchLogs}>
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-deep">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Time</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Trigger</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tier</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Disposition
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  Confidence
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Cost</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Latency</th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    No execution logs found.
                  </td>
                </tr>
              )}
              {!loading &&
                logs.map((log: ExecutionLogItem) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLogId(log.id)}
                    className="border-b border-border last:border-0 cursor-pointer transition-colors hover:bg-surface-deep"
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap max-w-[120px] truncate">
                      {log.triggerEventId.slice(0, 8)}...
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 ${log.promoted ? "text-orange-400" : "text-foreground"}`}
                      >
                        {log.modelTier === "tier3" ? "T3" : "T2"}
                        {log.promoted && <span className="text-[10px]">P</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {DISPOSITION_LABELS[log.disposition] ?? log.disposition}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">
                      {(log.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="px-3 py-2">
                      <span className={STATUS_COLORS[log.status] ?? "text-foreground"}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">
                      {log.estimatedCostCents.toFixed(2)}c
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {log.latencyMs}ms
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {log.inputTokens + log.outputTokens}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={page === 0}
              onClick={() => setPage((p: number) => p - 1)}
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p: number) => p + 1)}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
