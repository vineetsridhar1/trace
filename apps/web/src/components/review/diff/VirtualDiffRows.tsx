import { useEffect, useMemo, type ReactNode, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { hunkGapLabel, type DiffLine } from "../diff-patch";

export function VirtualDiffRows({
  lines,
  scrollRef,
  scrollMargin,
  requestedLine,
  onNavigateToLine,
  renderLine,
}: {
  lines: DiffLine[];
  scrollRef: RefObject<HTMLDivElement | null>;
  scrollMargin: number;
  requestedLine: number | null;
  onNavigateToLine(offset: number): void;
  renderLine(line: DiffLine, index: number): ReactNode;
}) {
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    initialOffset: () => scrollRef.current?.scrollTop ?? 0,
    scrollMargin,
    scrollPaddingStart: 44,
    estimateSize: (index) => (lines[index]?.kind === "meta" ? 26 : 20),
    overscan: 12,
  });
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) =>
    item.end < (virtualizer.scrollOffset ?? 0);
  const targetIndex = useMemo(
    () =>
      requestedLine === null
        ? -1
        : lines.findIndex((line) => line.kind !== "meta" && line.newLine === requestedLine),
    [requestedLine, lines],
  );
  useEffect(() => {
    if (targetIndex < 0) return;
    // Let ResizeObserver commit this file's real height before jumping inside it. Otherwise
    // the outer list still thinks a long file is a short placeholder and advances to a later file.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const target = virtualizer.getOffsetForIndex(targetIndex, "start");
        if (target) onNavigateToLine(target[0]);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [onNavigateToLine, scrollMargin, targetIndex, virtualizer]);
  // Keep horizontal width stable as rows unmount. One invisible plain-text line determines the
  // canvas width; syntax highlighting and interaction handlers exist only for visible rows.
  const longestLine = useMemo(() => {
    let longest = "";
    for (const line of lines) {
      if (line.text.length > longest.length) longest = line.text;
    }
    return longest;
  }, [lines]);
  return (
    <div className="native-scrollbar min-w-0 overflow-x-auto py-1 font-mono text-xs leading-5">
      <div className="relative min-w-full w-max" style={{ height: virtualizer.getTotalSize() }}>
        <div aria-hidden className="invisible h-0 whitespace-pre pl-16 pr-4">
          {longestLine}
        </div>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full"
            style={{ top: item.start - scrollMargin }}
          >
            {renderLine(lines[item.index]!, item.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Hidden hunk metadata is not a row and must not consume estimated scroll space. */
export function visibleDiffLines(lines: DiffLine[]): DiffLine[] {
  return lines.filter((line) => line.kind !== "meta" || hunkGapLabel(line) !== null);
}
