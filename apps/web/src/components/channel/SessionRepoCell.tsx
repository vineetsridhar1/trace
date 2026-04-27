import type { SessionGroupRow } from "./sessions-table-types";
import { getSessionRepo } from "./session-cell-data";

export function SessionRepoCell({ row }: { row?: SessionGroupRow }) {
  const repo = getSessionRepo(row);
  const slug = row?.slug;

  if (!repo && !slug) return null;

  const text = repo && slug ? `${repo.name} / ${slug}` : repo ? repo.name : slug;

  return <span className="truncate text-xs text-muted-foreground">{text}</span>;
}
