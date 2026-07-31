import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Monitor } from "lucide-react";
import type { SessionRuntimeInstance } from "@trace/gql";
import { AVAILABLE_RUNTIMES_QUERY } from "@trace/client-core";
import { client } from "../../lib/urql";
import { isAccessibleLocalRuntime } from "../../lib/bridge-access";
import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

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
  const [open, setOpen] = useState(false);
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Choose bridge"
        className={cn(
          "flex h-7 max-w-40 items-center gap-1.5 rounded-lg bg-transparent px-2 text-[11px]",
          "text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground",
          "focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
      >
        <Monitor className="size-3.5 shrink-0" />
        <span className="truncate">
          {selected?.label ?? (loading ? "Loading bridges…" : "Choose bridge")}
        </span>
        <ChevronDown className="size-3.5 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 overflow-hidden p-1.5">
        <div role="listbox" aria-label="Bridge" className="space-y-0.5">
          {connectedBridges.map((bridge) => {
            const lacksRepo = !!repoId && !bridge.registeredRepoIds.includes(repoId);
            return (
              <button
                key={bridge.id}
                type="button"
                role="option"
                aria-selected={bridge.id === selectedBridgeId}
                disabled={lacksRepo}
                title={lacksRepo ? "This bridge does not have the project repository linked" : ""}
                onClick={() => {
                  onSelect(bridge.id === selectedBridgeId ? null : bridge.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm",
                  "text-muted-foreground outline-none hover:bg-white/10 hover:text-foreground",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                  bridge.id === selectedBridgeId && "bg-white/10 text-foreground",
                )}
              >
                <Monitor className="size-3.5 shrink-0 text-green-400" />
                <span className="min-w-0 flex-1 truncate">{bridge.label}</span>
                {lacksRepo ? (
                  <span className="text-[10px]">repo unavailable</span>
                ) : bridge.id === selectedBridgeId ? (
                  <Check className="size-3.5 shrink-0" />
                ) : null}
              </button>
            );
          })}
          {!loading && connectedBridges.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No connected bridges
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
