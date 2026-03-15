import { useEffect, useState } from "react";
import { Cloud, Monitor, Loader2 } from "lucide-react";
import type { SessionRuntimeInstance } from "@trace/gql";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { client } from "../../lib/urql";
import { AVAILABLE_RUNTIMES_QUERY } from "../../lib/mutations";

interface RuntimeSelectorProps {
  tool: string;
  open: boolean;
  value: string | undefined;
  onChange: (runtimeId: string | undefined) => void;
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
        if (connected.length === 1) {
          onChange(connected[0].id);
        } else if (!fetched.find((r) => r.id === value)) {
          onChange(undefined);
        }
      })
      .finally(() => setLoading(false));
  }, [open, tool]); // eslint-disable-line react-hooks/exhaustive-deps -- value is only used for stale-check, not as a trigger

  const connectedRuntimes = runtimes.filter((r) => r.connected);
  const selectedRuntime = runtimes.find((r) => r.id === value);

  if (loading) {
    return (
      <div className="flex h-9 items-center gap-2 rounded-md border border-border px-3">
        <Loader2 size={14} className="animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (connectedRuntimes.length === 0) {
    return (
      <div className="flex h-9 items-center rounded-md border border-border px-3">
        <span className="text-sm text-muted-foreground">No runtimes available</span>
      </div>
    );
  }

  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => { if (v) onChange(v); }}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select runtime...">
          {selectedRuntime && (
            <RuntimeLabel runtime={selectedRuntime} />
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
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
