import { useState, useEffect, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { useAuthStore } from "../../stores/auth";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";
import { Button } from "../ui/button";

const EXECUTION_LOG_DETAIL_QUERY = gql`
  query AgentExecutionLogDetail($organizationId: ID!, $id: ID!) {
    agentExecutionLog(organizationId: $organizationId, id: $id) {
      id
      organizationId
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
      contextTokenAllocation
      disposition
      confidence
      plannedActions
      policyDecision
      finalActions
      status
      inboxItemId
      latencyMs
      createdAt
    }
  }
`;

interface ExecutionLogDetail {
  id: string;
  organizationId: string;
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
  contextTokenAllocation: Record<string, number> | null;
  disposition: string;
  confidence: number;
  plannedActions: Record<string, unknown>[] | null;
  policyDecision: Record<string, unknown> | null;
  finalActions: Record<string, unknown>[] | null;
  status: string;
  inboxItemId: string | null;
  latencyMs: number;
  createdAt: string;
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  if (!data || (typeof data === "object" && Object.keys(data as object).length === 0)) {
    return null;
  }
  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground mb-1">{label}</h4>
      <pre className="rounded border border-border bg-surface-deep p-3 text-xs font-mono text-foreground overflow-x-auto max-h-[400px] overflow-y-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="text-xs font-mono text-foreground">{value}</span>
    </div>
  );
}

export function ExecutionDetailView({
  logId,
  onBack,
}: {
  logId: string;
  onBack: () => void;
}) {
  const activeOrgId = useAuthStore((s) => s.activeOrgId);
  const [detail, setDetail] = useState<ExecutionLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    setError(null);
    const result = await client
      .query(EXECUTION_LOG_DETAIL_QUERY, { organizationId: activeOrgId, id: logId })
      .toPromise();
    if (result.error) {
      setError(result.error.message);
    } else if (result.data?.agentExecutionLog) {
      setDetail(result.data.agentExecutionLog as ExecutionLogDetail);
    } else {
      setError("Execution log not found");
    }
    setLoading(false);
  }, [activeOrgId, logId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  return (
    <div className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft size={16} />
        </Button>
        <h2 className="text-sm font-semibold text-foreground">Execution Detail</h2>
        {detail && (
          <span className="text-xs font-mono text-muted-foreground">{detail.id}</span>
        )}
      </div>

      {loading && (
        <div className="rounded-lg border border-border bg-surface-deep p-8 text-center">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {detail && (
        <div className="space-y-6">
          {/* Summary Section */}
          <div className="rounded-lg border border-border bg-surface-deep p-4 space-y-2">
            <h3 className="text-xs font-semibold text-foreground mb-3">Overview</h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1">
              <InfoRow label="Timestamp" value={new Date(detail.createdAt).toLocaleString()} />
              <InfoRow label="Status" value={detail.status} />
              <InfoRow label="Trigger Event" value={detail.triggerEventId} />
              <InfoRow label="Batch Size" value={detail.batchSize} />
              <InfoRow label="Agent ID" value={detail.agentId} />
              <InfoRow label="Model" value={detail.model} />
              <InfoRow label="Model Tier" value={detail.modelTier} />
              <InfoRow label="Promoted" value={detail.promoted ? `Yes — ${detail.promotionReason ?? "unknown"}` : "No"} />
              <InfoRow label="Disposition" value={detail.disposition} />
              <InfoRow label="Confidence" value={`${(detail.confidence * 100).toFixed(1)}%`} />
              <InfoRow label="Latency" value={`${detail.latencyMs}ms`} />
              <InfoRow label="Cost" value={`${detail.estimatedCostCents.toFixed(3)} cents`} />
              <InfoRow label="Input Tokens" value={detail.inputTokens.toLocaleString()} />
              <InfoRow label="Output Tokens" value={detail.outputTokens.toLocaleString()} />
              <InfoRow label="Inbox Item" value={detail.inboxItemId} />
            </div>
          </div>

          {/* Decision Chain */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold text-foreground">Decision Chain</h3>

            <JsonBlock
              label="Context Token Allocation"
              data={detail.contextTokenAllocation}
            />

            <JsonBlock
              label="Planned Actions (Planner Output)"
              data={detail.plannedActions}
            />

            <JsonBlock
              label="Policy Decision"
              data={detail.policyDecision}
            />

            <JsonBlock
              label="Final Actions (Executed)"
              data={detail.finalActions}
            />
          </div>
        </div>
      )}
    </div>
  );
}
