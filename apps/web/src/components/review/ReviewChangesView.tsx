import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { gql } from "@urql/core";
import type { ReviewFile, ReviewThread as ReviewThreadType } from "@trace/gql";
import { toast } from "sonner";
import { useReviewUiStore } from "../../stores/review-ui";
import { Button } from "../ui/button";
import { ReviewDiff, type ReviewLineSelection } from "./ReviewDiff";
import { ReviewFileList } from "./ReviewFileList";
import { mutateReview } from "./review-operations";
import { ReviewThread } from "./ReviewThread";

const CREATE_THREAD = gql`
  mutation CreateReviewThread($input: CreateReviewThreadInput!) {
    createReviewThread(input: $input) {
      id
    }
  }
`;
const ENQUEUE_INQUIRY = gql`
  mutation EnqueueReviewInquiry($input: EnqueueReviewInquiryInput!) {
    enqueueReviewInquiry(input: $input) {
      id
    }
  }
`;

interface ReviewChangesViewProps {
  reviewId: string;
  snapshotId: string;
  files: ReviewFile[];
  threads: ReviewThreadType[];
}

export function ReviewChangesView({
  reviewId,
  snapshotId,
  files,
  threads,
}: ReviewChangesViewProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const selection = useReviewUiStore((state) => state.byReviewId[reviewId]);
  const patchUi = useReviewUiStore((state) => state.patch);
  const [composer, setComposer] = useState<{
    kind: "comment" | "ask";
    scope: "line" | "file";
    anchor: ReviewLineSelection;
  } | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 520,
    overscan: 2,
    getItemKey: (index) => files[index]!.path,
  });

  useEffect(() => {
    const path = selection?.requestedFilePath;
    if (!path) return;
    const index = files.findIndex((file) => file.path === path);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "start" });
    patchUi(reviewId, { requestedFilePath: null });
  }, [files, patchUi, reviewId, selection?.requestedFilePath, virtualizer]);

  useEffect(() => {
    const first = virtualizer.getVirtualItems()[0];
    const file = first ? files[first.index] : null;
    if (file && selection?.activeFilePath !== file.path)
      patchUi(reviewId, { activeFilePath: file.path });
  }, [files, patchUi, reviewId, selection?.activeFilePath, virtualizer.getVirtualItems()]);

  const selectFile = useCallback(
    (path: string) => {
      const index = files.findIndex((file) => file.path === path);
      if (index >= 0) virtualizer.scrollToIndex(index, { align: "start" });
      patchUi(reviewId, { activeFilePath: path });
    },
    [files, patchUi, reviewId, virtualizer],
  );

  const virtualItems = virtualizer.getVirtualItems();
  const submit = async () => {
    if (!composer || !body.trim()) return;
    setSubmitting(true);
    const anchor = { snapshotId, ...composer.anchor };
    try {
      if (composer.kind === "comment") {
        await mutateReview(CREATE_THREAD, {
          input: { reviewId, snapshotId, scope: composer.scope, body: body.trim(), anchor },
        });
        toast.success("Comment saved in Trace");
      } else {
        await mutateReview(ENQUEUE_INQUIRY, {
          input: {
            reviewId,
            snapshotId,
            sourceKind: "diff_anchor",
            question: body.trim(),
            anchor,
            context: {
              selectedText: composer.anchor.selectedText,
              surroundingContext: composer.anchor.context,
            },
          },
        });
        toast.success("Question added to Review Chat");
      }
      setBody("");
      setComposer(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review action failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1">
      <ReviewFileList
        files={files}
        activePath={selection?.activeFilePath ?? files[0]?.path ?? null}
        onSelect={selectFile}
      />
      <div
        ref={parentRef}
        className="native-scrollbar relative min-w-0 flex-1 overflow-y-auto bg-background p-3"
      >
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualItems.map((item) => {
            const file = files[item.index]!;
            return (
              <div
                key={file.path}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className="absolute left-0 top-0 w-full pb-3"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <ReviewDiff
                  snapshotId={snapshotId}
                  filePath={file.path}
                  requestedLine={
                    selection?.activeFilePath === file.path ? selection?.requestedLine : null
                  }
                  onComment={(anchor) => {
                    setBody("");
                    setComposer({ kind: "comment", scope: "line", anchor });
                  }}
                  onAsk={(anchor) => {
                    setBody("");
                    setComposer({ kind: "ask", scope: "line", anchor });
                  }}
                  onFileComment={(path) => {
                    setBody("");
                    setComposer({
                      kind: "comment",
                      scope: "file",
                      anchor: {
                        filePath: path,
                        side: "head",
                        startLine: 1,
                        endLine: 1,
                        selectedText: "",
                        context: "",
                      },
                    });
                  }}
                />
                {threads
                  .filter((thread) => thread.anchor?.filePath === file.path)
                  .map((thread) => (
                    <ReviewThread key={thread.id} thread={thread} />
                  ))}
              </div>
            );
          })}
        </div>
      </div>
      {composer ? (
        <div className="absolute bottom-4 left-1/2 z-30 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-border bg-surface-deep p-3 shadow-2xl">
          <div className="mb-2 text-xs font-medium">
            {composer.kind === "comment" ? "Comment for team" : "Ask AI"} ·{" "}
            {composer.anchor.filePath}:{composer.anchor.startLine}
            {composer.anchor.endLine !== composer.anchor.startLine
              ? `–${composer.anchor.endLine}`
              : ""}
          </div>
          <textarea
            autoFocus
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="h-20 w-full resize-none rounded-md border border-border bg-background p-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            placeholder={
              composer.kind === "comment"
                ? "Leave durable feedback in Trace…"
                : "Ask about these lines…"
            }
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setComposer(null)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!body.trim() || submitting} onClick={() => void submit()}>
              {composer.kind === "comment" ? "Save in Trace" : "Queue question"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
