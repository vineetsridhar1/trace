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
  preferLocal = false,
  onSelect,
  onLoadingChange,
}: {
  selectedBridgeId: string | null;
  repoId: string | null;
  tool: string;
  preferLocal?: boolean;
  onSelect: (bridgeId: string | null) => void;
  onLoadingChange?: (loading: boolean) => void;
}) {
  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [preferCloud, setPreferCloud] = useState(false);
  const connectedBridges = useMemo(() => runtimes.filter(isAccessibleLocalRuntime), [runtimes]);
  const selected = connectedBridges.find((bridge) => bridge.id === selectedBridgeId) ?? null;
  const preferredBridge = connectedBridges.find(
    (bridge) => !repoId || bridge.registeredRepoIds.includes(repoId),
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    onLoadingChange?.(true);
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
  }, [onLoadingChange, tool]);

  useEffect(() => {
    setPreferCloud(false);
  }, [repoId, tool]);

  useEffect(() => {
    if (loading) return;
    if (preferLocal && !preferCloud && !selectedBridgeId && preferredBridge) {
      onLoadingChange?.(true);
      onSelect(preferredBridge.id);
      return;
    }
    onLoadingChange?.(false);
  }, [
    loading,
    onLoadingChange,
    onSelect,
    preferCloud,
    preferredBridge,
    preferLocal,
    selectedBridgeId,
  ]);

  useEffect(() => {
    if (!selectedBridgeId || loading) return;
    const selectedRuntime = connectedBridges.find((bridge) => bridge.id === selectedBridgeId);
    if (!selectedRuntime || (repoId && !selectedRuntime.registeredRepoIds.includes(repoId))) {
      onSelect(null);
    }
  }, [connectedBridges, loading, onSelect, repoId, selectedBridgeId]);

  return (
    <Select
      value={selectedBridgeId ?? "cloud"}
      onValueChange={(bridgeId) => {
        const cloud = bridgeId === "cloud";
        setPreferCloud(cloud);
        onSelect(cloud ? null : bridgeId);
      }}
    >
      <SelectTrigger
        size="sm"
        className="max-w-40 border-transparent bg-transparent hover:border-transparent hover:bg-white/10 data-popup-open:border-transparent"
        aria-label="Choose bridge"
        title={selected?.label ?? "Cloud"}
      >
        <SelectValue placeholder={loading ? "Loading bridges…" : "Choose bridge"}>
          {selected ? (
            <>
              <Monitor />
              <span className="truncate">{selected.label}</span>
            </>
          ) : (
            <span>Cloud</span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-56">
        <SelectItem value="cloud">Cloud</SelectItem>
        {connectedBridges.map((bridge) => {
          const lacksRepo = !!repoId && !bridge.registeredRepoIds.includes(repoId);
          return (
            <SelectItem
              key={bridge.id}
              value={bridge.id}
              disabled={lacksRepo}
              title={
                lacksRepo ? "This bridge does not have the project repository linked" : bridge.label
              }
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
