import type { ReviewAnchor, ReviewInquiry } from "@trace/gql";

export function inquiryConversationRoot(
  inquiry: ReviewInquiry,
  inquiries: Record<string, ReviewInquiry>,
): string {
  const visited = new Set<string>([inquiry.id]);
  let current = inquiry;
  while (true) {
    const context = current.context;
    const parentId =
      context && typeof context === "object" && !Array.isArray(context)
        ? context.followUpToInquiryId
        : null;
    if (typeof parentId !== "string" || visited.has(parentId)) return current.id;
    const parent = inquiries[parentId];
    if (!parent || parent.reviewId !== inquiry.reviewId || parent.snapshotId !== inquiry.snapshotId)
      return current.id;
    visited.add(parentId);
    current = parent;
  }
}

export function conversationRoots(
  inquiries: ReviewInquiry[],
  allInquiries: ReviewInquiry[],
): ReviewInquiry[] {
  const byId = Object.fromEntries(allInquiries.map((inquiry) => [inquiry.id, inquiry]));
  return inquiries.filter((inquiry) => inquiryConversationRoot(inquiry, byId) === inquiry.id);
}

export function reviewInquiryAnchor(
  inquiry: Pick<ReviewInquiry, "anchor">,
): Pick<ReviewAnchor, "filePath" | "side" | "startLine" | "endLine"> | null {
  const anchor = inquiry.anchor;
  if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) return null;
  const value = anchor as Record<string, unknown>;
  if (
    typeof value.filePath !== "string" ||
    (value.side !== "base" && value.side !== "head") ||
    typeof value.startLine !== "number" ||
    typeof value.endLine !== "number"
  ) {
    return null;
  }
  return {
    filePath: value.filePath,
    side: value.side,
    startLine: value.startLine,
    endLine: value.endLine,
  };
}

export function inquiriesQueuedAhead(
  inquiry: Pick<ReviewInquiry, "id" | "position" | "state">,
  inquiries: ReviewInquiry[],
): ReviewInquiry[] {
  if (inquiry.state !== "queued") return [];
  return inquiries
    .filter(
      (candidate) =>
        candidate.id !== inquiry.id &&
        candidate.position < inquiry.position &&
        (candidate.state === "queued" || candidate.state === "running"),
    )
    .sort((a, b) => a.position - b.position);
}

export function inquiryQueueLabel(inquiry: Pick<ReviewInquiry, "sourceKind" | "question">): string {
  if (inquiry.sourceKind === "guide_generation") return "Guide generation";
  const normalized = inquiry.question.replace(/\s+/g, " ").trim();
  return normalized.length > 72 ? `${normalized.slice(0, 69)}…` : normalized;
}
