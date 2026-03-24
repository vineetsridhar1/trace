import type { SessionGroupRow } from "./sessions-table-types";
import { getSessionRepo } from "./session-cell-data";

export function SessionRepoCell({ row }: { row?: SessionGroupRow }) {
  const repo = getSessionRepo(row);
  if (!repo) return null;

  return <span className="truncate text-xs text-muted-foreground">{repo.name}</span>;
}
