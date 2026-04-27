import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSessionGridRows, getDefaultExpandedStatuses } from "./session-grid-grouping";
import type { SessionGridRow, SessionGroupRow } from "./sessions-table-types";

export function useSessionStatusGrouping(rows: SessionGroupRow[]): {
  gridRows: SessionGridRow[];
  onFilterModelChanged: (model: Record<string, unknown> | null) => void;
  onToggleStatusGroup: (status: string) => void;
} {
  const knownStatusesRef = useRef<Set<string>>(new Set());
  const [filterModel, setFilterModel] = useState<Record<string, unknown> | null>(null);
  const [expandedStatuses, setExpandedStatuses] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const defaultExpanded = getDefaultExpandedStatuses(rows);
    setExpandedStatuses((previous) => {
      let changed = false;
      const next = new Set(previous);

      for (const status of defaultExpanded) {
        if (knownStatusesRef.current.has(status)) continue;
        next.add(status);
        changed = true;
      }

      for (const row of rows) {
        knownStatusesRef.current.add(row.displaySessionStatus);
      }

      return changed ? next : previous;
    });
  }, [rows]);

  const gridRows = useMemo(
    () => buildSessionGridRows({ expandedStatuses, filterModel, rows }),
    [expandedStatuses, filterModel, rows],
  );

  const onToggleStatusGroup = useCallback((status: string) => {
    setExpandedStatuses((previous) => {
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
