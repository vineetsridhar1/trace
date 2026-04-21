import { TerminalSquare } from "lucide-react";
import { timeAgo } from "../../lib/utils";
import { useSessionGroupTerminals } from "../../stores/terminal";
import type { SessionGroupRow } from "./sessions-table-types";
import { getSessionLastActivityAt, getSessionRepo } from "./session-cell-data";
import { SessionStatusIndicator } from "./SessionStatusIndicator";

export function SessionCompactSummaryCell({ row }: { row?: SessionGroupRow }) {
  if (!row) return null;

  const repo = getSessionRepo(row);
  const lastActivityAt = getSessionLastActivityAt(row);
  const branch = row.branch ?? row.slug;
  const terminals = useSessionGroupTerminals(row.id);
  const hasActiveTerminal = terminals.some((t) => t.status === "active");

  const subtext = repo && branch
    ? `${repo.name} / ${branch}`
    : repo
      ? repo.name
      : branch ?? null;

  return (
    <div className="flex h-full w-full min-w-0 flex-1 flex-col justify-center py-2">
      <div className="flex w-full min-w-0 items-center gap-2">
        <SessionStatusIndicator row={row} />
        <span className="truncate text-sm font-medium text-foreground">{row.name}</span>
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
        <span className="shrink-0 text-right">
          {lastActivityAt ? timeAgo(lastActivityAt) : ""}
        </span>
      </div>
    </div>
  );
}
