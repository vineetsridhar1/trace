import { useCallback, useMemo, useState } from "react";
import { buildSessionGridRows } from "./session-grid-grouping";
import type { SessionGridRow, SessionGroupRow } from "./sessions-table-types";

export function useSessionStatusGrouping(rows: SessionGroupRow[]): {
  gridRows: SessionGridRow[];
  onFilterModelChanged: (model: Record<string, unknown> | null) => void;
  onToggleStatusGroup: (status: string) => void;
} {
  const [filterModel, setFilterModel] = useState<Record<string, unknown> | null>(null);
  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(() => new Set());

  const gridRows = useMemo(
    () => buildSessionGridRows({ collapsedStatuses, filterModel, rows }),
    [collapsedStatuses, filterModel, rows],
  );

  const onToggleStatusGroup = useCallback((status: string) => {
    setCollapsedStatuses((previous) => {
      const next = new Set(previous);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  return {
    gridRows,
    onFilterModelChanged: setFilterModel,
    onToggleStatusGroup,
  };
}
