import { useCallback, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ReviewDiffFile, ReviewFile, ReviewInquiry, ReviewThread } from "@trace/gql";
import { useReviewUiStore } from "../../stores/review-ui";
import type { ReviewLineSelection } from "./review-selection";
import { ReviewFileDiff } from "./ReviewFileDiff";
import { ReviewOverview } from "./ReviewOverview";

function defaultCollapsed(file: ReviewFile): boolean {
  return file.status === "removed" || file.additions + file.deletions >= 1_000;
}

/** Files and their rows share this one scroll element; neither level adds a vertical scroller. */
export function ReviewVirtualFiles({
  reviewId,
  snapshotId,
  title,
  description,
  pullRequestNumber,
  files,
  threads,
  inquiries,
  onComment,
  onAsk,
}: {
  reviewId: string;
  snapshotId: string;
  title: string;
  description: string;
  pullRequestNumber: number;
  files: ReviewFile[];
  threads: ReviewThread[];
  inquiries: ReviewInquiry[];
  onComment(selection: ReviewLineSelection): void;
  onAsk(selection: ReviewLineSelection): void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Immutable patches only. Bounded per viewport, so revisiting recent files doesn't refetch,
  // while traversing a large PR doesn't retain all its patches in memory.
  const patchCache = useRef(new Map<string, ReviewDiffFile>());
  const selection = useReviewUiStore((state) => state.byReviewId[reviewId]);
  const patchUi = useReviewUiStore((state) => state.patch);
  const toggleCollapsed = useReviewUiStore((state) => state.toggleFileCollapsed);
  const indices = useMemo(
    () => new Map(files.map((file, index) => [file.path, index + 1])),
    [files],
  );
  const getItemKey = useCallback(
    (index: number) => (index === 0 ? "overview" : `file:${files[index - 1]!.path}`),
    [files],
  );
  const virtualizer = useVirtualizer({
    count: files.length + 1,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: (index) => {
      const file = files[index - 1];
      return file && (selection?.fileCollapsedOverrides[file.path] ?? defaultCollapsed(file))
        ? 58
        : 240;
    },
    overscan: 2,
    paddingStart: 16,
    paddingEnd: 24,
  });
  // Row measurement handles changes above the viewport inside the active file. At this level
  // adjust only wholly preceding files, otherwise both virtualizers would compensate twice.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) =>
    item.end < (virtualizer.scrollOffset ?? 0);
  const items = virtualizer.getVirtualItems();
  const activeIndex = virtualizer.range?.startIndex ?? 0;
  useEffect(() => {
    const file = files[Math.max(0, activeIndex - 1)];
    if (file && file.path !== useReviewUiStore.getState().byReviewId[reviewId]?.activeFilePath)
      patchUi(reviewId, { activeFilePath: file.path });
  }, [activeIndex, files, patchUi, reviewId]);

  const requestedFilePath = selection?.requestedFilePath;
  useEffect(() => {
    if (!requestedFilePath) return;
    const index = indices.get(requestedFilePath);
    if (index !== undefined) {
      // Index navigation works even when the destination has no DOM node yet. Avoid smooth
      // scrolling over estimated heights: newly measured files would move the target mid-flight.
      virtualizer.scrollToIndex(index, { align: "start" });
    }
    patchUi(reviewId, { requestedFilePath: null });
  }, [indices, patchUi, requestedFilePath, reviewId, virtualizer]);

  const navigateToLine = useCallback(
    (offset: number) => {
      // Use the outer virtualizer for both stages of navigation. Competing file/row scrollToIndex
      // operations would otherwise keep correcting the same scroll element to different targets.
      virtualizer.scrollToOffset(offset);
      patchUi(reviewId, { requestedLine: null });
    },
    [patchUi, reviewId, virtualizer],
  );

  return (
    <div
      ref={scrollRef}
      style={{ overflowAnchor: "none" }}
      data-review-scroll
      className="native-scrollbar min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-[var(--th-review-canvas)] px-[18px]"
    >
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {items.map((item) => {
          const file = files[item.index - 1];
          return (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full pb-4"
              style={{ top: item.start }}
            >
              {file ? (
                <ReviewFileDiff
                  snapshotId={snapshotId}
                  filePath={file.path}
                  status={file.status}
                  additions={file.additions}
                  deletions={file.deletions}
                  threads={threads}
                  inquiries={inquiries}
                  collapsed={selection?.fileCollapsedOverrides[file.path] ?? defaultCollapsed(file)}
                  highlight={selection?.highlight ?? null}
                  onToggleCollapsed={() => {
                    toggleCollapsed(reviewId, file.path, defaultCollapsed(file));
                    virtualizer.scrollToIndex(item.index, { align: "start" });
                  }}
                  onComment={onComment}
                  onAsk={onAsk}
                  scrollRef={scrollRef}
                  fileStart={item.start}
                  estimatedHeight={item.size - 16}
                  patchCache={patchCache.current}
                  requestedLine={
                    !requestedFilePath && selection?.highlight?.filePath === file.path
                      ? selection.requestedLine
                      : null
                  }
                  onNavigateToLine={navigateToLine}
                />
              ) : (
                <ReviewOverview
                  title={title}
                  description={description}
                  pullRequestNumber={pullRequestNumber}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
