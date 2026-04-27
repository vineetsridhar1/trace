import { Laptop, TerminalSquare } from "lucide-react";
import { useAttachedCheckoutForGroup } from "../../stores/bridges";
import { useSessionGroupTerminals } from "../../stores/terminal";
import { useUIStore, type UIState } from "../../stores/ui";
import type { SessionGroupRow } from "./sessions-table-types";
import { SessionStatusIndicator } from "./SessionStatusIndicator";

export function SessionNameCell({ row }: { row?: SessionGroupRow }) {
  if (!row) return null;

  const hasDoneBadge = useUIStore((s: UIState) => !!s.sessionGroupDoneBadges[row.id]);
  const terminals = useSessionGroupTerminals(row.id);
  const hasActiveTerminal = terminals.some((t) => t.status === "active");
  const attached = useAttachedCheckoutForGroup(row.id);

  return (
    <div className="flex h-full items-center gap-2">
      <SessionStatusIndicator row={row} />
      <span className={`truncate text-sm text-foreground ${hasDoneBadge ? "font-semibold" : ""}`}>
        {row.name}
      </span>
      {attached && (
        <span
          title={`Synced to ${attached.bridgeLabel}`}
          className="inline-flex shrink-0"
          aria-label={`Synced to ${attached.bridgeLabel}`}
        >
          <Laptop className="h-3.5 w-3.5 text-emerald-500" />
        </span>
      )}
      {hasActiveTerminal && (
        <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
    </div>
  );
}
