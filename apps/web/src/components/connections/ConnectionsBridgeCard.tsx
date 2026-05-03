import { useState } from "react";
import { ChevronRight, Laptop, WifiOff } from "lucide-react";
import type { ConnectionBridge } from "../../hooks/useConnections";
import { cn } from "../../lib/utils";
import { ConnectionsRepoRow } from "./ConnectionsRepoRow";

export function ConnectionsBridgeCard({
  connection,
  onRefresh,
}: {
  connection: ConnectionBridge;
  onRefresh: () => Promise<void>;
}) {
  const { bridge, repos } = connection;
  const [openRepoIds, setOpenRepoIds] = useState<Record<string, boolean>>({});

  if (!bridge.connected) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <WifiOff size={16} className="text-muted-foreground" />
        <BridgeTitle label={bridge.label} caption="Disconnected" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Laptop size={16} className="text-muted-foreground" />
        <BridgeTitle
          label={bridge.label}
          caption={`${repos.length} ${repos.length === 1 ? "repo" : "repos"}`}
        />
        <span className="ml-auto h-2 w-2 rounded-full bg-emerald-500" />
      </div>

      <div className="divide-y divide-border">
        {repos.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">No visible repos.</div>
        ) : (
          repos.map((entry) => {
            const open = openRepoIds[entry.repo.id] ?? false;
            return (
              <div key={entry.repo.id}>
                <button
                  type="button"
                  onClick={() => setOpenRepoIds((state) => ({ ...state, [entry.repo.id]: !open }))}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-elevated"
                >
                  <ChevronRight
                    size={15}
                    className={cn(
                      "text-muted-foreground transition-transform",
                      open && "rotate-90",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {entry.repo.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">main worktree</div>
                  </div>
                </button>
                {open && (
                  <ConnectionsRepoRow
                    bridgeRuntimeId={bridge.id}
                    bridgeInstanceId={bridge.instanceId}
                    canTerminal={connection.canTerminal}
                    entry={entry}
                    onRefresh={onRefresh}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function BridgeTitle({ label, caption }: { label: string; caption: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-medium text-foreground">{label}</div>
      <div className="truncate text-xs text-muted-foreground">{caption}</div>
    </div>
  );
}
