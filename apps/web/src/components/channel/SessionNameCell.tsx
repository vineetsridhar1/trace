import type { SessionGroupRow } from "./sessions-table-types";
import { SessionStatusIndicator } from "./SessionStatusIndicator";
import { ScrambleText } from "../ui/ScrambleText";

export function SessionNameCell({ row }: { row?: SessionGroupRow }) {
  if (!row) return null;

  return (
    <div className="flex h-full items-center gap-2">
      <SessionStatusIndicator row={row} />
      <span className="truncate text-sm text-foreground"><ScrambleText text={row.name} animateOnMount /></span>
    </div>
  );
}
