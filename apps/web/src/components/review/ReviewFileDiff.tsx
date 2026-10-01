import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gql } from "@urql/core";
import type { ReviewDiffFile, ReviewInquiry, ReviewThread as ReviewThreadType } from "@trace/gql";
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
import { ReviewInquiryCard } from "./ReviewInquiryCard";
import { inquiriesQueuedAhead, inquiryQueueLabel, reviewInquiryAnchor } from "./review-inquiry";
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
  filePath: string;
  status: string;
  additions: number;
  deletions: number;
  threads: ReviewThreadType[];
  inquiries: ReviewInquiry[];
  collapsed: boolean;
  highlight: ReviewHighlight | null;
  onToggleCollapsed(): void;
  onComment(selection: ReviewLineSelection): void;
  onAsk(selection: ReviewLineSelection): void;
}

function anchorKey(side: string, line: number): string {
  return `${side}:${line}`;
}

function ReviewThreadStack({ threadIds }: { threadIds: string[] }) {
  if (threadIds.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 border-y border-[var(--th-edge-faint)] bg-[var(--th-review-canvas)] p-3 pl-16 font-sans leading-normal">
      {threadIds.map((threadId) => (
        <ReviewThread key={threadId} threadId={threadId} />
      ))}
    </div>
  );
}

function ReviewInquiryStack({
  inquiries,
  allInquiries,
}: {
  inquiries: ReviewInquiry[];
  allInquiries: ReviewInquiry[];
}) {
  if (inquiries.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 border-y border-[var(--th-review-ai)]/15 bg-[var(--th-review-canvas)] p-3 pl-16 font-sans leading-normal">
      {inquiries.map((inquiry) => {
        const ahead = inquiriesQueuedAhead(inquiry, allInquiries);
        return (
          <ReviewInquiryCard
            key={inquiry.id}
            inquiryId={inquiry.id}
            queuedAheadCount={ahead.length}
            blockerLabel={ahead[0] ? inquiryQueueLabel(ahead[0]) : null}
          />
        );
      })}
    </div>
  );
}

export function ReviewFileDiff({
  snapshotId,
  filePath,
  status,
  additions,
  deletions,
  threads,
  inquiries,
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
      .query(DIFF_QUERY, { snapshotId, filePath: filePath })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        if (result.error) setError(result.error.message);
        else setDiff((result.data?.reviewDiffFile as ReviewDiffFile | undefined) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [collapsed, diff, error, filePath, snapshotId, visible]);

  const lines = useMemo(() => parsePatch(diff?.patch ?? ""), [diff?.patch]);
  const selection = range ? selectionFromLines(filePath, lines, range) : null;
  const highlighted = highlight?.filePath === filePath ? highlight : null;

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

  useEffect(() => {
    if (!range) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-review-selection-popover]")) return;
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

  const fileThreads = useMemo(
    () => threads.filter((thread) => thread.anchor?.filePath === filePath),
    [filePath, threads],
  );
  const threadsByAnchor = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const thread of fileThreads) {
      if (!thread.anchor || thread.scope !== "line") continue;
      const key = anchorKey(thread.anchor.side, thread.anchor.endLine);
      grouped.set(key, [...(grouped.get(key) ?? []), thread.id]);
    }
    return grouped;
  }, [fileThreads]);
  const fileInquiries = useMemo(
    () =>
      inquiries.filter((inquiry) => {
        const anchor = reviewInquiryAnchor(inquiry);
        return (
          inquiry.snapshotId === snapshotId &&
          inquiry.sourceKind === "diff_anchor" &&
          anchor?.filePath === filePath
        );
      }),
    [filePath, inquiries, snapshotId],
  );
  const inquiriesByAnchor = useMemo(() => {
    const grouped = new Map<string, ReviewInquiry[]>();
    for (const inquiry of fileInquiries) {
      const anchor = reviewInquiryAnchor(inquiry);
      if (!anchor) continue;
      const key = anchorKey(anchor.side, anchor.endLine);
      grouped.set(key, [...(grouped.get(key) ?? []), inquiry]);
    }
    return grouped;
  }, [fileInquiries]);
  const renderedAnchorKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const line of lines) {
      if (line.kind === "meta") continue;
      const side = lineSide(line);
      const lineNumber = lineNumberForSide(line, side);
      if (lineNumber != null) keys.add(anchorKey(side, lineNumber));
    }
    return keys;
  }, [lines]);
  const trailingThreadIds = useMemo(
    () =>
      fileThreads
        .filter(
          (thread) =>
            !thread.anchor ||
            thread.scope !== "line" ||
            !renderedAnchorKeys.has(anchorKey(thread.anchor.side, thread.anchor.endLine)),
        )
        .map((thread) => thread.id),
    [fileThreads, renderedAnchorKeys],
  );

  return (
    <section
      ref={cardRef}
      data-review-file={filePath}
      className="relative min-w-0 shrink-0 overflow-clip rounded-[9px] border border-[var(--th-review-card-edge)] bg-[var(--th-review-card)]"
    >
      <DiffFileHeader
        filePath={filePath}
        status={status}
        additions={additions}
        deletions={deletions}
        threadCount={fileThreads.length}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
      />
      {collapsed ? null : error ? (
        <p className="p-4 text-xs text-destructive">{error}</p>
      ) : !diff ? (
        <div className="h-40 animate-pulse bg-muted/10" />
      ) : (
        <>
          <div className="native-scrollbar min-w-0 overflow-x-auto py-1 font-mono text-xs leading-5">
            <div className="min-w-max">
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
                const anchoredThreadIds =
                  lineNumber == null
                    ? []
                    : (threadsByAnchor.get(anchorKey(side, lineNumber)) ?? []);
                const anchoredInquiries =
                  lineNumber == null
                    ? []
                    : (inquiriesByAnchor.get(anchorKey(side, lineNumber)) ?? []);
                return (
                  <Fragment key={index}>
                    <DiffLineRow
                      ref={
                        isHighlighted && lineNumber === highlighted.startLine
                          ? highlightRowRef
                          : null
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
                    <ReviewThreadStack threadIds={anchoredThreadIds} />
                    <ReviewInquiryStack inquiries={anchoredInquiries} allInquiries={inquiries} />
                  </Fragment>
                );
              })}
            </div>
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
      {!collapsed ? <ReviewThreadStack threadIds={trailingThreadIds} /> : null}
    </section>
  );
}
