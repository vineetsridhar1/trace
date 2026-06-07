import { Laptop, TerminalSquare } from "lucide-react";
import { timeAgo } from "../../lib/utils";
import { useAttachedCheckoutForGroup } from "../../stores/bridges";
import { useSessionGroupTerminals } from "../../stores/terminal";
import { PrivateSessionLock } from "../session/PrivateSessionLock";
import { SessionApplicationRunningIndicator } from "../session/SessionApplicationRunningIndicator";
import type { SessionGroupRenameContext } from "./session-group-rename-context";
import type { SessionGroupRow } from "./sessions-table-types";
import { getSessionBranch, getSessionLastActivityAt, getSessionRepo } from "./session-cell-data";
import { SessionGroupNameInlineEditor } from "./SessionGroupNameInlineEditor";
import { SessionStatusIndicator } from "./SessionStatusIndicator";

export function SessionCompactSummaryCell({
  renameContext,
  row,
}: {
  renameContext?: SessionGroupRenameContext | null;
  row?: SessionGroupRow;
}) {
  if (!row) return null;

  const repo = getSessionRepo(row);
  const lastActivityAt = getSessionLastActivityAt(row);
  const branch = getSessionBranch(row);
  const terminals = useSessionGroupTerminals(row.id);
  const hasActiveTerminal = terminals.some((t) => t.status === "active");
  const attached = useAttachedCheckoutForGroup(row.id);
  const isRenaming = renameContext?.renamingGroupId === row.id;

  const subtext = repo && branch ? `${repo.name} / ${branch}` : repo ? repo.name : branch;

  return (
    <div className="flex h-full w-full min-w-0 flex-1 flex-col justify-center py-2">
      <div className="flex w-full min-w-0 items-center gap-2">
        <SessionStatusIndicator row={row} />
        {isRenaming ? (
          <SessionGroupNameInlineEditor
            initialName={row.name}
            onCancel={() => renameContext?.onRenameCancel()}
            onSubmit={(name) => renameContext?.onRenameSubmit(row, name)}
          />
        ) : (
          <span className="truncate text-sm font-medium text-foreground">{row.name}</span>
        )}
        {attached && (
          <span
            title={`Synced to ${attached.bridgeLabel}`}
            className="inline-flex shrink-0"
            aria-label={`Synced to ${attached.bridgeLabel}`}
          >
            <Laptop className="h-3.5 w-3.5 text-emerald-500" />
          </span>
        )}
        <SessionApplicationRunningIndicator sessionGroupId={row.id} />
        {row.visibility === "private" && (
          <PrivateSessionLock
            className="h-3.5 w-3.5 text-muted-foreground"
            iconClassName="h-3.5 w-3.5"
          />
        )}
        {hasActiveTerminal && (
          <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
      </div>
      <div className="mt-2.5 flex w-full min-w-0 items-center gap-3 text-[11px] text-muted-foreground">
        <div className="min-w-0 flex-1">
          {subtext && (
            <span className="block truncate text-[11px] font-medium text-muted-foreground/90">
              {subtext}
            </span>
          )}
        </div>
        <span className="shrink-0 text-right">{lastActivityAt ? timeAgo(lastActivityAt) : ""}</span>
      </div>
    </div>
  );
}
