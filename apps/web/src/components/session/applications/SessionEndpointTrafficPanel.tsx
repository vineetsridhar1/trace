import { useEffect, useMemo, useState } from "react";
import { gql } from "@urql/core";
import { RotateCw, Trash2 } from "lucide-react";
import type { EndpointTrafficEntry, SessionEndpoint } from "@trace/gql";
import { cn } from "@/lib/utils";
import { client } from "../../../lib/urql";
import { Button } from "../../ui/button";

const ENDPOINTS_QUERY = gql`
  query SessionEndpointTrafficEndpoints($sessionGroupId: ID!) {
    sessionEndpoints(sessionGroupId: $sessionGroupId) {
      id
      key
      url
      sessionGroupId
      appConfigId
      processConfigId
      portConfigId
      label
      targetPort
      status
      accessMode
      trafficCaptureMode
      enabledAt
      disabledAt
      revokedAt
    }
  }
`;

const TRAFFIC_QUERY = gql`
  query EndpointTrafficTab($endpointId: ID!, $limit: Int) {
    endpointTraffic(endpointId: $endpointId, limit: $limit) {
      id
      endpointId
      startedAt
      durationMs
      requestMethod
      requestPath
      responseStatus
      error
    }
  }
`;

const CLEAR_TRAFFIC_MUTATION = gql`
  mutation ClearEndpointTrafficTab($endpointId: ID!) {
    clearEndpointTraffic(endpointId: $endpointId)
  }
`;

export function SessionEndpointTrafficPanel({
  sessionGroupId,
  initialEndpointId,
}: {
  sessionGroupId: string;
  initialEndpointId: string | null;
}) {
  const [endpoints, setEndpoints] = useState<SessionEndpoint[]>([]);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(initialEndpointId);
  const [trafficEntries, setTrafficEntries] = useState<EndpointTrafficEntry[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedEndpoint = useMemo(
    () => endpoints.find((endpoint) => endpoint.id === selectedEndpointId) ?? null,
    [endpoints, selectedEndpointId],
  );

  useEffect(() => {
    setSelectedEndpointId(initialEndpointId);
  }, [initialEndpointId]);

  useEffect(() => {
    let cancelled = false;
    void client
      .query(ENDPOINTS_QUERY, { sessionGroupId })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        const nextEndpoints = (result.data?.sessionEndpoints as SessionEndpoint[] | undefined) ?? [];
        setEndpoints(nextEndpoints);
        setSelectedEndpointId((current) => current ?? nextEndpoints[0]?.id ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionGroupId]);

  useEffect(() => {
    if (!selectedEndpointId) {
      setTrafficEntries([]);
      return;
    }
    let cancelled = false;
    const loadTraffic = () => {
      void client
        .query(TRAFFIC_QUERY, { endpointId: selectedEndpointId, limit: 100 })
        .toPromise()
        .then((result) => {
          if (cancelled) return;
          setTrafficEntries((result.data?.endpointTraffic as EndpointTrafficEntry[] | undefined) ?? []);
        });
    };
    loadTraffic();
    const interval = window.setInterval(loadTraffic, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selectedEndpointId]);

  const clearTraffic = async () => {
    if (!selectedEndpointId) return;
    setPending(true);
    setError(null);
    try {
      const result = await client
        .mutation(CLEAR_TRAFFIC_MUTATION, { endpointId: selectedEndpointId })
        .toPromise();
      if (result.error) throw new Error(result.error.message);
      setTrafficEntries([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-surface-deep">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface-mid px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Endpoint Traffic</h2>
          <p className="truncate text-xs text-muted-foreground">
            {selectedEndpoint?.url ?? "Select an endpoint to inspect captured requests."}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Refresh traffic"
            aria-label="Refresh traffic"
            disabled={!selectedEndpointId}
            onClick={() => {
              if (!selectedEndpointId) return;
              void client
                .query(TRAFFIC_QUERY, { endpointId: selectedEndpointId, limit: 100 })
                .toPromise()
                .then((result) => {
                  setTrafficEntries((result.data?.endpointTraffic as EndpointTrafficEntry[] | undefined) ?? []);
                });
            }}
          >
            <RotateCw size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Clear traffic"
            aria-label="Clear traffic"
            disabled={!selectedEndpointId || pending}
            onClick={() => void clearTraffic()}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)] overflow-hidden">
        <aside className="min-h-0 overflow-auto border-r border-border bg-background/30 p-3">
          <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Endpoints
          </p>
          <div className="space-y-1.5">
            {endpoints.length === 0 ? (
              <p className="rounded-md border border-border/70 bg-background/35 px-3 py-2 text-xs text-muted-foreground">
                No endpoints configured.
              </p>
            ) : (
              endpoints.map((endpoint) => {
                const endpointUrl = typeof endpoint.url === "string" ? endpoint.url : "";
                return (
                  <button
                    key={endpoint.id}
                    type="button"
                    className={cn(
                      "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                      selectedEndpointId === endpoint.id
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/70 bg-background/45 hover:bg-background/70",
                    )}
                    onClick={() => setSelectedEndpointId(endpoint.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground">
                        {endpoint.label}
                        <span className="ml-1 font-normal text-muted-foreground">:{endpoint.targetPort}</span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize",
                          endpoint.status === "enabled"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {endpoint.status}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                      {endpointUrl || "No URL"}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>
        <main className="min-h-0 overflow-hidden p-4">
          {error && (
            <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex h-full flex-col overflow-hidden rounded-md border border-border/70 bg-background/35">
            <div className="grid grid-cols-[5rem_4rem_minmax(0,1fr)_4rem_5rem] gap-3 border-b border-border/70 bg-surface-deep/70 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>Time</span>
              <span>Method</span>
              <span>Path</span>
              <span>Status</span>
              <span className="text-right">Latency</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {trafficEntries.length === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No traffic captured yet.
                </p>
              ) : (
                trafficEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid grid-cols-[5rem_4rem_minmax(0,1fr)_4rem_5rem] gap-3 border-b border-border/40 px-3 py-2 text-xs last:border-b-0"
                  >
                    <span className="font-mono text-muted-foreground">
                      {new Date(entry.startedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span className="font-mono font-medium text-foreground">{entry.requestMethod}</span>
                    <span className="truncate font-mono text-muted-foreground" title={entry.requestPath}>
                      {entry.requestPath}
                    </span>
                    <span
                      className={cn(
                        "font-mono font-medium",
                        entry.error
                          ? "text-destructive"
                          : entry.responseStatus != null && entry.responseStatus >= 500
                            ? "text-destructive"
                            : entry.responseStatus != null && entry.responseStatus >= 400
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {entry.responseStatus ?? (entry.error ? "ERR" : "...")}
                    </span>
                    <span className="text-right font-mono text-muted-foreground">
                      {entry.durationMs != null ? `${entry.durationMs}ms` : "-"}
                    </span>
                    {entry.error && (
                      <span className="col-span-5 truncate font-mono text-[11px] text-destructive">
                        {entry.error}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
