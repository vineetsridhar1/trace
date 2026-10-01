import { useMemo } from "react";
import { useEntityStore } from "@trace/client-core";
import { reviewInquiryAnchor } from "../review-inquiry";

export function useGuideDiscussions(reviewId: string, snapshotId: string, filePath: string) {
  const threads = useEntityStore((state) => state.reviewThreads);
  const inquiries = useEntityStore((state) => state.reviewInquiries);
  return useMemo(() => {
    const threadsByLine = new Map<number, string[]>();
    const inquiriesByLine = new Map<number, string[]>();
    for (const thread of Object.values(threads)) {
      const anchor = thread.anchor;
      if (
        thread.reviewId !== reviewId ||
        anchor?.snapshotId !== snapshotId ||
        anchor.filePath !== filePath ||
        anchor.side !== "head"
      )
        continue;
      threadsByLine.set(anchor.endLine, [...(threadsByLine.get(anchor.endLine) ?? []), thread.id]);
    }
    for (const inquiry of Object.values(inquiries)) {
      const anchor = reviewInquiryAnchor(inquiry);
      if (
        inquiry.reviewId !== reviewId ||
        inquiry.snapshotId !== snapshotId ||
        inquiry.sourceKind !== "diff_anchor" ||
        anchor?.filePath !== filePath ||
        anchor.side !== "head"
      )
        continue;
      inquiriesByLine.set(anchor.endLine, [
        ...(inquiriesByLine.get(anchor.endLine) ?? []),
        inquiry.id,
      ]);
    }
    return { threadsByLine, inquiriesByLine };
  }, [threads, inquiries, reviewId, snapshotId, filePath]);
}
