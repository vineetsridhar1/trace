import { useUIStore } from "../../stores/ui";
import type { SessionGroupRow } from "./sessions-table-types";
import { SessionStatusIndicator } from "./SessionStatusIndicator";

export function SessionNameCell({ row }: { row?: SessionGroupRow }) {
  if (!row) return null;

  const hasDoneBadge = useUIStore((s) => !!s.sessionGroupDoneBadges[row.id]);

  return (
    <div className="flex h-full items-center gap-2">
      <SessionStatusIndicator row={row} />
      <span className={`truncate text-sm text-foreground ${hasDoneBadge ? "font-semibold" : ""}`}>{row.name}</span>
    </div>
  );
}
