import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gql } from "@urql/core";
import type { ReviewDiffFile, ReviewFile, ReviewThread as ReviewThreadType } from "@trace/gql";
import { client } from "../../lib/urql";
import { hunkGapLabel, parsePatch } from "./diff-patch";
import {
  type LineRange,
  lineNumberForSide,
  lineSide,
  rangeContains,
  selectionFromLines,
  selectionRangeLabel,
  type ReviewLineSelection,
} from "./review-selection";
import { DiffFileHeader } from "./diff/DiffFileHeader";
import { DiffGapRow } from "./diff/DiffGapRow";
import { DiffLineRow, type DiffLineEmphasis } from "./diff/DiffLineRow";
import { DiffSelectionPopover } from "./diff/DiffSelectionPopover";
import { ReviewThread } from "./ReviewThread";
import type { ReviewHighlight } from "../../stores/review-ui";

const DIFF_QUERY = gql`
  query ReviewDiffFile($snapshotId: ID!, $filePath: String!) {
    reviewDiffFile(snapshotId: $snapshotId, filePath: $filePath) {
      snapshotId
      path
      status
      additions
      deletions
      patch
      truncated
    }
  }
`;

interface ReviewFileDiffProps {
  snapshotId: string;
  file: ReviewFile;
  threads: ReviewThreadType[];
  collapsed: boolean;
  highlight: ReviewHighlight | null;
  onToggleCollapsed(): void;
  onComment(selection: ReviewLineSelection): void;
  onAsk(selection: ReviewLineSelection): void;
}

export function ReviewFileDiff({
  snapshotId,
  file,
  threads,
  collapsed,
  highlight,
  onToggleCollapsed,
  onComment,
  onAsk,
}: ReviewFileDiffProps) {
  const cardRef = useRef<HTMLElement>(null);
  const highlightRowRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [diff, setDiff] = useState<ReviewDiffFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<LineRange | null>(null);
  const [dragging, setDragging] = useState(false);
  const [popoverTop, setPopoverTop] = useState(0);

  // The continuous diff holds every changed file, so each card only fetches its patch once it is
  // close to the viewport. Otherwise opening a review fires one request per changed file at once.
  useEffect(() => {
    const element = cardRef.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || collapsed || diff || error) return;
    let cancelled = false;
    void client
      .query(DIFF_QUERY, { snapshotId, filePath: file.path })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        if (result.error) setError(result.error.message);
        else setDiff((result.data?.reviewDiffFile as ReviewDiffFile | undefined) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [collapsed, diff, error, file.path, snapshotId, visible]);

  const lines = useMemo(() => parsePatch(diff?.patch ?? ""), [diff?.patch]);
  const selection = range ? selectionFromLines(file.path, lines, range) : null;
  const highlighted = highlight?.filePath === file.path ? highlight : null;

  useEffect(() => {
    if (!highlighted || lines.length === 0) return;
    highlightRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlighted, lines.length]);

  useEffect(() => {
    if (!dragging) return;
    const stop = () => setDragging(false);
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, [dragging]);

  const beginSelection = useCallback(
    (event: React.PointerEvent, side: LineRange["side"], line: number) => {
      if (event.button !== 0) return;
      setRange({ side, start: line, end: line });
      setDragging(true);
      setPopoverTop((event.currentTarget as HTMLElement).offsetTop + 26);
    },
    [],
  );

  const extendSelection = useCallback(
    (side: LineRange["side"], line: number) => {
      if (!dragging) return;
      setRange((current) =>
        current && current.side === side
          ? { side, start: Math.min(current.start, line), end: Math.max(current.end, line) }
          : current,
      );
    },
    [dragging],
  );

  const fileThreads = threads.filter((thread) => thread.anchor?.filePath === file.path);

  return (
    <section
      ref={cardRef}
      data-review-file={file.path}
      className="relative shrink-0 rounded-[9px] border border-[#232326] bg-[#0f0f10]"
    >
      <DiffFileHeader
        filePath={file.path}
        status={file.status}
        additions={file.additions}
        deletions={file.deletions}
        threadCount={fileThreads.length}
        collapsed={collapsed}
        viewed={file.viewed}
        onToggleCollapsed={onToggleCollapsed}
      />
      {collapsed ? null : error ? (
        <p className="p-4 text-xs text-destructive">{error}</p>
      ) : !diff ? (
        <div className="h-40 animate-pulse bg-muted/10" />
      ) : (
        <>
          <div className="py-1 font-mono text-xs leading-5">
            {lines.map((line, index) => {
              if (line.kind === "meta") {
                const label = hunkGapLabel(line);
                return label ? <DiffGapRow key={index} label={label} position="between" /> : null;
              }
              const side = lineSide(line);
              const lineNumber = lineNumberForSide(line, side);
              const selected = rangeContains(range, side, lineNumber);
              const isHighlighted =
                !!highlighted &&
                side === "head" &&
                lineNumber != null &&
                lineNumber >= highlighted.startLine &&
                lineNumber <= highlighted.endLine;
              const emphasis: DiffLineEmphasis = selected
                ? "selected"
                : isHighlighted
                  ? "asked"
                  : "none";
              return (
                <DiffLineRow
                  key={index}
                  ref={
                    isHighlighted && lineNumber === highlighted.startLine ? highlightRowRef : null
                  }
                  line={line}
                  emphasis={emphasis}
                  lineNumber={lineNumber}
                  onPointerDown={
                    lineNumber == null
                      ? undefined
                      : (event) => beginSelection(event, side, lineNumber)
                  }
                  onPointerEnter={
                    lineNumber == null ? undefined : () => extendSelection(side, lineNumber)
                  }
                />
              );
            })}
          </div>
          {diff.truncated ? (
            <DiffGapRow label="diff truncated · open on GitHub" position="end" />
          ) : null}
          {selection && range ? (
            <DiffSelectionPopover
              rangeLabel={selectionRangeLabel(range)}
              top={popoverTop}
              onComment={() => {
                onComment(selection);
                setRange(null);
              }}
              onAsk={() => {
                onAsk(selection);
                setRange(null);
              }}
            />
          ) : null}
        </>
      )}
      {!collapsed && fileThreads.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-[#1f1f23] p-3 pl-16">
          {fileThreads.map((thread) => (
            <ReviewThread key={thread.id} thread={thread} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
