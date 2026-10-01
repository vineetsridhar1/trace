import { Fragment, useRef } from "react";
import type { DiffLine } from "../diff-patch";
import { DiffLineRow } from "../diff/DiffLineRow";
import { DiffSelectionPopover } from "../diff/DiffSelectionPopover";
import { useReviewLineSelection } from "../useReviewLineSelection";
import { rangeContains, selectionRangeLabel, type ReviewLineSelection } from "../review-selection";
import { useGuideDiscussions } from "./useGuideDiscussions";
import { GuideLineDiscussions } from "./GuideLineDiscussions";

export function GuideSnippetDiff({
  reviewId,
  snapshotId,
  filePath,
  lines,
  onComment,
  onAsk,
}: {
  reviewId: string;
  snapshotId: string;
  filePath: string;
  lines: DiffLine[];
  onComment(selection: ReviewLineSelection): void;
  onAsk(selection: ReviewLineSelection): void;
}) {
  const { threadsByLine, inquiriesByLine } = useGuideDiscussions(reviewId, snapshotId, filePath);
  const containerRef = useRef<HTMLDivElement>(null);
  const { range, selection, popoverTop, beginSelection, extendSelection, clearSelection } =
    useReviewLineSelection(filePath, lines, containerRef);
  return (
    <div ref={containerRef} className={selection ? "relative pb-12" : "relative"}>
      <div className="native-scrollbar min-w-0 overflow-x-auto py-1 font-mono text-xs leading-5">
        <div className="min-w-max">
          {lines.map((line) => (
            <Fragment key={line.newLine}>
              <DiffLineRow
                line={line}
                lineNumber={line.newLine}
                emphasis={rangeContains(range, "head", line.newLine) ? "selected" : "none"}
                onPointerDown={
                  line.newLine === null
                    ? undefined
                    : (event) => beginSelection(event, "head", line.newLine!)
                }
                onPointerEnter={
                  line.newLine === null ? undefined : () => extendSelection("head", line.newLine!)
                }
              />
              {line.newLine !== null &&
              (threadsByLine.has(line.newLine) || inquiriesByLine.has(line.newLine)) ? (
                <GuideLineDiscussions
                  reviewId={reviewId}
                  threadIds={threadsByLine.get(line.newLine)}
                  inquiryIds={inquiriesByLine.get(line.newLine)}
                />
              ) : null}
            </Fragment>
          ))}
        </div>
      </div>
      {range && selection ? (
        <DiffSelectionPopover
          rangeLabel={selectionRangeLabel(range)}
          top={popoverTop}
          onComment={() => {
            onComment(selection);
            clearSelection();
          }}
          onAsk={() => {
            onAsk(selection);
            clearSelection();
          }}
        />
      ) : null}
    </div>
  );
}
