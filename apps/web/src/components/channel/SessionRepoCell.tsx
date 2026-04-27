import type { SessionGroupRow } from "./sessions-table-types";
import { getSessionBranch, getSessionRepo } from "./session-cell-data";

export function SessionRepoCell({ row }: { row?: SessionGroupRow }) {
  const repo = getSessionRepo(row);
  const branch = getSessionBranch(row);

  if (!repo && !branch) return null;

  const text = repo && branch ? `${repo.name} / ${branch}` : repo ? repo.name : branch;

  return <span className="truncate text-xs text-muted-foreground">{text}</span>;
}
