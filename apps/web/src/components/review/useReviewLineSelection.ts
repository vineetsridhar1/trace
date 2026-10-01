import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import type { DiffLine } from "./diff-patch";
import { selectionFromLines, type LineRange } from "./review-selection";

/** Shared line-selection behavior for Changes and the Guide's bounded excerpts. */
export function useReviewLineSelection(
  filePath: string,
  lines: DiffLine[],
  containerRef: RefObject<HTMLElement | null>,
) {
  const [range, setRange] = useState<LineRange | null>(null);
  const [dragging, setDragging] = useState(false);
  const [popoverTop, setPopoverTop] = useState(0);
  const selection = useMemo(
    () => (range ? selectionFromLines(filePath, lines, range) : null),
    [filePath, lines, range],
  );
  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, [dragging]);
  useEffect(() => {
    if (!range) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-review-selection-popover]")
      )
        return;
      setRange(null);
      setDragging(false);
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [range]);
  const beginSelection = useCallback(
    (event: React.PointerEvent, side: LineRange["side"], line: number) => {
      if (event.button !== 0) return;
      setRange({ side, start: line, end: line });
      setDragging(true);
      const rowTop = event.currentTarget.getBoundingClientRect().top;
      setPopoverTop(rowTop - (containerRef.current?.getBoundingClientRect().top ?? rowTop) + 26);
    },
    [containerRef],
  );
  const extendSelection = useCallback(
    (side: LineRange["side"], line: number) => {
      if (!dragging) return;
      setRange((current) =>
        current && current.side === side
          ? {
              side,
              start: Math.min(current.start, line),
              end: Math.max(current.end, line),
            }
          : current,
      );
    },
    [dragging],
  );
  return {
    range,
    selection,
    popoverTop,
    beginSelection,
    extendSelection,
    clearSelection: () => setRange(null),
  };
}
