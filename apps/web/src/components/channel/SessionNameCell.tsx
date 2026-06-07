import { Laptop, TerminalSquare } from "lucide-react";
import { useAttachedCheckoutForGroup } from "../../stores/bridges";
import { useSessionGroupTerminals } from "../../stores/terminal";
import { useUIStore, type UIState } from "../../stores/ui";
import { PrivateSessionLock } from "../session/PrivateSessionLock";
import { SessionApplicationRunningIndicator } from "../session/SessionApplicationRunningIndicator";
import type { SessionGroupRenameContext } from "./session-group-rename-context";
import type { SessionGroupRow } from "./sessions-table-types";
import { SessionGroupNameInlineEditor } from "./SessionGroupNameInlineEditor";
import { SessionStatusIndicator } from "./SessionStatusIndicator";

export function SessionNameCell({
  renameContext,
  row,
}: {
  renameContext?: SessionGroupRenameContext | null;
  row?: SessionGroupRow;
}) {
  if (!row) return null;

  const hasDoneBadge = useUIStore((s: UIState) => !!s.sessionGroupDoneBadges[row.id]);
  const terminals = useSessionGroupTerminals(row.id);
  const hasActiveTerminal = terminals.some((t) => t.status === "active");
  const attached = useAttachedCheckoutForGroup(row.id);
  const isRenaming = renameContext?.renamingGroupId === row.id;

  return (
    <div className="flex h-full items-center gap-2">
      <SessionStatusIndicator row={row} />
      {isRenaming ? (
        <SessionGroupNameInlineEditor
          initialName={row.name}
          onCancel={() => renameContext?.onRenameCancel()}
          onSubmit={(name) => renameContext?.onRenameSubmit(row, name)}
        />
      ) : (
        <span className={`truncate text-sm text-foreground ${hasDoneBadge ? "font-semibold" : ""}`}>
          {row.name}
        </span>
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
  );
}
