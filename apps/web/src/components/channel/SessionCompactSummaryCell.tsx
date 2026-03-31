import { timeAgo } from "../../lib/utils";
import type { SessionGroupRow } from "./sessions-table-types";
import { getSessionLastActivityAt, getSessionRepo } from "./session-cell-data";
import { SessionStatusIndicator } from "./SessionStatusIndicator";
import { ScrambleText } from "../ui/ScrambleText";

export function SessionCompactSummaryCell({ row }: { row?: SessionGroupRow }) {
  if (!row) return null;

  const repo = getSessionRepo(row);
  const lastActivityAt = getSessionLastActivityAt(row);

  return (
    <div className="flex h-full w-full min-w-0 flex-1 flex-col justify-center py-2">
      <div className="flex w-full min-w-0 items-center gap-2">
        <SessionStatusIndicator row={row} />
        <span className="truncate text-sm font-medium text-foreground"><ScrambleText text={row.name} animateOnMount /></span>
      </div>
      <div className="mt-2.5 flex w-full min-w-0 items-center gap-3 text-[11px] text-muted-foreground">
        <div className="min-w-0 flex-1">
          {repo && (
            <span className="block truncate text-[11px] font-medium text-muted-foreground/90">
              {repo.name}
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
