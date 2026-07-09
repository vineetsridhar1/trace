import type { SessionGroupRow } from "./sessions-table-types";
import { getSessionBranch, getSessionRepo } from "./session-cell-data";

export function SessionRepoCell({ row }: { row?: SessionGroupRow }) {
  const repo = getSessionRepo(row);
  const branch = getSessionBranch(row);

  if (!repo && !branch) return null;

  return (
    <span className="truncate text-xs text-muted-foreground">
      {repo?.name}
      {repo && branch ? " / " : ""}
      {branch && <span className="font-mono">{branch}</span>}
    </span>
  );
}
