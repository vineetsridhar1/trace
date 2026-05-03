import { GitBranch, GitCommit, Link2 } from "lucide-react";
import type { ConnectionRepoEntry } from "../../hooks/useConnections";
import { useUIStore } from "../../stores/ui";
import { ConnectionsRepoTerminals } from "./ConnectionsRepoTerminals";
import { ConnectionsSyncActions } from "./ConnectionsSyncActions";

export function ConnectionsRepoRow({
  bridgeRuntimeId,
  bridgeInstanceId,
  canTerminal,
  entry,
  onRefresh,
}: {
  bridgeRuntimeId: string;
  bridgeInstanceId: string;
  canTerminal: boolean;
  entry: ConnectionRepoEntry;
  onRefresh: () => Promise<void>;
}) {
  const checkout = entry.linkedCheckout ?? null;
  const group = checkout?.attachedSessionGroup ?? null;
  const setActiveSessionGroupId = useUIStore((s) => s.setActiveSessionGroupId);
  const branch = checkout?.currentBranch ?? group?.branch ?? checkout?.targetBranch ?? null;
  const commit = checkout?.lastSyncedCommitSha ?? checkout?.currentCommitSha ?? null;

  return (
    <div className="space-y-3 bg-background px-8 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {group ? (
          <button
            type="button"
            onClick={() => setActiveSessionGroupId(group.id)}
            className="flex min-w-0 items-center gap-2 rounded-md bg-surface-elevated px-2 py-1 text-left text-sm hover:bg-surface-hover"
          >
            <Link2 size={14} className="shrink-0 text-muted-foreground" />
            <span className="truncate text-foreground">{group.name}</span>
          </button>
        ) : (
          <div className="text-sm text-muted-foreground">No synced session</div>
        )}
        {branch && (
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-elevated px-2 py-1 text-xs text-muted-foreground">
            <GitBranch size={12} />
            {branch}
          </span>
        )}
        {commit && (
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-elevated px-2 py-1 font-mono text-xs text-muted-foreground">
            <GitCommit size={12} />
            {commit.slice(0, 7)}
          </span>
        )}
        {checkout?.lastSyncError && (
          <span className="text-xs text-destructive">{checkout.lastSyncError}</span>
        )}
      </div>

      {checkout?.isAttached && checkout.attachedSessionGroupId ? (
        <ConnectionsSyncActions
          checkout={checkout}
          runtimeInstanceId={bridgeInstanceId}
          onChanged={onRefresh}
        />
      ) : null}

      {canTerminal && <ConnectionsRepoTerminals bridgeRuntimeId={bridgeRuntimeId} entry={entry} />}
    </div>
  );
}
