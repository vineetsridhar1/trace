import { useState, useEffect, useCallback } from "react";
import { Circle } from "lucide-react";
import { useAuthStore, type AuthState } from "@trace/client-core";
import { client } from "../../lib/urql";
import { gql } from "@urql/core";

const WORKER_STATUS_QUERY = gql`
  query AgentWorkerStatus($organizationId: ID!) {
    agentWorkerStatus(organizationId: $organizationId) {
      running
      uptime
      openAggregationWindows
      activeOrganizations
    }
    agentAggregationWindows(organizationId: $organizationId) {
      scopeKey
      eventCount
      openedAt
      lastEventAt
    }
  }
`;

interface WorkerStatus {
  running: boolean;
  uptime: number | null;
  openAggregationWindows: number;
  activeOrganizations: number;
}

interface AggregationWindow {
  scopeKey: string;
  eventCount: number;
  openedAt: string;
  lastEventAt: string;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function WorkerStatusBar() {
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [windows, setWindows] = useState<AggregationWindow[]>([]);
  const [showWindows, setShowWindows] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!activeOrgId) return;
    const result = await client
      .query(WORKER_STATUS_QUERY, { organizationId: activeOrgId })
      .toPromise();
    if (result.data) {
      setStatus(result.data.agentWorkerStatus as WorkerStatus);
      setWindows((result.data.agentAggregationWindows as AggregationWindow[]) ?? []);
    }
  }, [activeOrgId]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return (
    <div className="shrink-0 border-b border-border bg-surface-deep px-4 py-2">
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <Circle
            size={8}
            className={
              status?.running ? "fill-green-500 text-green-500" : "fill-red-500 text-red-500"
            }
          />
          <span className="text-muted-foreground">
            Worker: {status?.running ? "Running" : "Stopped"}
          </span>
        </div>
        {status?.running && status.uptime != null && (
          <span className="text-muted-foreground">Uptime: {formatUptime(status.uptime)}</span>
        )}
        <span className="text-muted-foreground">Orgs: {status?.activeOrganizations ?? 0}</span>
        <button
          onClick={() => setShowWindows(!showWindows)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Windows: {status?.openAggregationWindows ?? 0}
        </button>
      </div>

      {showWindows && windows.length > 0 && (
        <div className="mt-2 rounded border border-border bg-background p-2">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Active Aggregation Windows
          </div>
          <div className="space-y-1">
            {windows.map((w: AggregationWindow) => (
              <div key={w.scopeKey} className="flex items-center gap-3 text-xs">
                <span className="font-mono text-foreground">{w.scopeKey}</span>
                <span className="text-muted-foreground">{w.eventCount} events</span>
                <span className="text-muted-foreground">
                  opened {new Date(w.openedAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
