import { ChevronDown, ChevronRight } from "lucide-react";
import { SessionStatusGroupLabel } from "./SessionStatusGroupLabel";
import type { SessionStatusHeaderRow as SessionStatusHeaderRowData } from "./sessions-table-types";

export function SessionStatusHeaderRow({
  row,
}: {
  row: SessionStatusHeaderRowData;
}) {
  const Icon = row._expanded ? ChevronDown : ChevronRight;

  return (
    <div className="flex h-full w-full items-center gap-2 bg-surface-mid px-3">
      <Icon size={14} className="text-muted-foreground" />
      <SessionStatusGroupLabel count={row._count} status={row._status} />
    </div>
  );
}
