import { useEffect, useMemo, useState } from "react";
import { Monitor } from "lucide-react";
import type { SessionRuntimeInstance } from "@trace/gql";
import { AVAILABLE_RUNTIMES_QUERY } from "@trace/client-core";
import { client } from "../../lib/urql";
import { isAccessibleLocalRuntime } from "../../lib/bridge-access";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export function HomeBridgePicker({
  selectedBridgeId,
  repoId,
  tool,
  onSelect,
}: {
  selectedBridgeId: string | null;
  repoId: string | null;
  tool: string;
  onSelect: (bridgeId: string | null) => void;
}) {
  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const connectedBridges = useMemo(() => runtimes.filter(isAccessibleLocalRuntime), [runtimes]);
  const selected = connectedBridges.find((bridge) => bridge.id === selectedBridgeId) ?? null;

  useEffect(() => {
    let active = true;
    setLoading(true);
    void client
      .query(
        AVAILABLE_RUNTIMES_QUERY,
        { tool, sessionGroupId: null },
        { requestPolicy: "network-only" },
      )
      .toPromise()
      .then((result: { data?: Record<string, unknown> }) => {
        if (!active) return;
        setRuntimes((result.data?.availableRuntimes ?? []) as SessionRuntimeInstance[]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tool]);

  useEffect(() => {
    if (!selectedBridgeId || loading) return;
    const selectedRuntime = connectedBridges.find((bridge) => bridge.id === selectedBridgeId);
    if (!selectedRuntime || (repoId && !selectedRuntime.registeredRepoIds.includes(repoId))) {
      onSelect(null);
    }
  }, [connectedBridges, loading, onSelect, repoId, selectedBridgeId]);

  return (
    <Select
      value={selectedBridgeId}
      onValueChange={(bridgeId) => {
        if (bridgeId) onSelect(bridgeId);
      }}
    >
      <SelectTrigger
        size="sm"
        className="max-w-40 border-transparent bg-transparent hover:border-transparent hover:bg-white/10 data-popup-open:border-transparent"
        aria-label="Choose bridge"
      >
        <SelectValue placeholder={loading ? "Loading bridges…" : "Choose bridge"}>
          {selected ? (
            <>
              <Monitor />
              <span className="truncate">{selected.label}</span>
            </>
          ) : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {connectedBridges.map((bridge) => {
          const lacksRepo = !!repoId && !bridge.registeredRepoIds.includes(repoId);
          return (
            <SelectItem
              key={bridge.id}
              value={bridge.id}
              disabled={lacksRepo}
              title={lacksRepo ? "This bridge does not have the project repository linked" : ""}
            >
              <Monitor />
              <span className="min-w-0 flex-1 truncate">{bridge.label}</span>
              {lacksRepo ? <span className="text-xs">repo unavailable</span> : null}
            </SelectItem>
          );
        })}
        {!loading && connectedBridges.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No connected bridges
          </p>
        ) : null}
      </SelectContent>
    </Select>
  );
}
