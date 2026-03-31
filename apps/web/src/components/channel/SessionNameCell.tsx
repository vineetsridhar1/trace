import type { SessionGroupRow } from "./sessions-table-types";
import { SessionStatusIndicator } from "./SessionStatusIndicator";

export function SessionNameCell({ row }: { row?: SessionGroupRow }) {
  if (!row) return null;

  const slug = row.slug;

  return (
    <div className="flex h-full items-center gap-2">
      <SessionStatusIndicator row={row} />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{row.name}</span>
        {slug && (
          <span className="block truncate text-[11px] text-muted-foreground">{slug}</span>
        )}
      </div>
    </div>
  );
}
