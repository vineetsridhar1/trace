import { useEffect, useState } from "react";
import { Cloud, Monitor, Loader2 } from "lucide-react";
import type { SessionRuntimeInstance, CodingTool } from "@trace/gql";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { client } from "../../lib/urql";
import { AVAILABLE_RUNTIMES_QUERY } from "../../lib/mutations";

/** Sentinel value for the on-demand cloud option */
export const CLOUD_RUNTIME_ID = "__cloud__";

/** Subset of runtime info exposed to consumers for bridge-aware decisions */
export interface RuntimeInfo {
  hostingMode: "cloud" | "local";
  registeredRepoIds: string[];
}

interface RuntimeSelectorProps {
  tool: CodingTool;
  open: boolean;
  value: string | undefined;
  onChange: (runtimeId: string | undefined, info: RuntimeInfo | null) => void;
}

export function RuntimeSelector({ tool, open, value, onChange }: RuntimeSelectorProps) {
  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    client
      .query(AVAILABLE_RUNTIMES_QUERY, { tool })
      .toPromise()
      .then((result) => {
        const fetched = (result.data?.availableRuntimes ?? []) as SessionRuntimeInstance[];
        setRuntimes(fetched);
        const connected = fetched.filter((r) => r.connected);
        if (connected.length === 1 && !value) {
          const rt = connected[0];
          onChange(rt.id, { hostingMode: rt.hostingMode, registeredRepoIds: rt.registeredRepoIds });
        } else if (connected.length === 0 && !value) {
          // Auto-select cloud when no local runtimes are available
          onChange(CLOUD_RUNTIME_ID, { hostingMode: "cloud", registeredRepoIds: [] });
        } else if (value && value !== CLOUD_RUNTIME_ID && !fetched.find((r) => r.id === value)) {
          onChange(undefined, null);
        }
      })
      .finally(() => setLoading(false));
  }, [open, tool]); // eslint-disable-line react-hooks/exhaustive-deps -- value is only used for stale-check, not as a trigger

  const connectedRuntimes = runtimes.filter((r) => r.connected);
  const selectedRuntime = value === CLOUD_RUNTIME_ID ? null : runtimes.find((r) => r.id === value);

  if (loading) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border border-border px-3">
        <Loader2 size={14} className="animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => {
        if (!v) return;
        if (v === CLOUD_RUNTIME_ID) {
          onChange(v, { hostingMode: "cloud", registeredRepoIds: [] });
        } else {
          const rt = runtimes.find((r) => r.id === v);
          onChange(v, rt ? { hostingMode: rt.hostingMode, registeredRepoIds: rt.registeredRepoIds } : null);
        }
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select runtime...">
          {value === CLOUD_RUNTIME_ID ? (
            <span className="flex items-center gap-1.5">
              <Cloud size={12} className="shrink-0 text-blue-400" />
              Cloud
            </span>
          ) : selectedRuntime ? (
            <RuntimeLabel runtime={selectedRuntime} />
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={CLOUD_RUNTIME_ID}>
          <span className="flex items-center gap-1.5">
            <Cloud size={12} className="shrink-0 text-blue-400" />
            Cloud
            <span className="text-xs text-muted-foreground">(on-demand)</span>
          </span>
        </SelectItem>
        {connectedRuntimes.map((rt) => (
          <SelectItem key={rt.id} value={rt.id}>
            <span className="flex items-center gap-1.5">
              <RuntimeIcon hostingMode={rt.hostingMode} />
              {rt.label}
              <span className="text-xs text-muted-foreground">
                ({rt.sessionCount} session{rt.sessionCount !== 1 ? "s" : ""})
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RuntimeIcon({ hostingMode }: { hostingMode: string }) {
  return hostingMode === "cloud" ? (
    <Cloud size={12} className="shrink-0 text-blue-400" />
  ) : (
    <Monitor size={12} className="shrink-0 text-green-400" />
  );
}

function RuntimeLabel({ runtime }: { runtime: SessionRuntimeInstance }) {
  return (
    <span className="flex items-center gap-1.5">
      <RuntimeIcon hostingMode={runtime.hostingMode} />
      {runtime.label}
    </span>
  );
}
