import type {
  ReviewAnchor,
  ReviewAnchorStatus,
  ReviewDeliveryStatus,
  ReviewInquiryState,
} from "@trace/gql";

export interface StatePresentation {
  label: string;
  /** Tailwind text colour for the label. */
  text: string;
  /** Tailwind background colour for the status dot, when the state shows one. */
  dot: string;
}

/**
 * Anchor state answers "is this comment still pointing at the right code?", so a relocated anchor
 * reports where it moved to rather than just saying it moved.
 */
export function anchorPresentation(anchor: ReviewAnchor): StatePresentation {
  const status: ReviewAnchorStatus = anchor.status;
  if (status === "relocated")
    return {
      label:
        anchor.originalLine != null && anchor.originalLine !== anchor.startLine
          ? `Moved L${anchor.originalLine}→L${anchor.startLine}`
          : "Relocated",
      text: "text-[#93c5fd]",
      dot: "bg-[#60a5fa]",
    };
  if (status === "ambiguous")
    return { label: "Ambiguous", text: "text-[#c4b5fd]", dot: "bg-[#a78bfa]" };
  if (status === "outdated")
    return { label: "Line no longer exists", text: "text-[#fbbf24]", dot: "bg-[#fbbf24]" };
  return { label: anchorRangeLabel(anchor), text: "text-[#6ee7b7]", dot: "bg-[#34d399]" };
}

export function anchorRangeLabel(anchor: ReviewAnchor): string {
  return anchor.endLine === anchor.startLine
    ? `L${anchor.startLine}`
    : `L${anchor.startLine}–${anchor.endLine}`;
}

export function deliveryPresentation(status: ReviewDeliveryStatus): StatePresentation {
  switch (status) {
    case "selected":
      return { label: "In GitHub review", text: "text-[#93c5fd]", dot: "bg-[#3b82f6]" };
    case "delivered":
      return { label: "Delivered", text: "text-[#6ee7b7]", dot: "bg-[#34d399]" };
    case "delivery_failed":
      return { label: "Failed", text: "text-[#fca5a5]", dot: "bg-[#f87171]" };
    case "outdated":
      return { label: "Outdated", text: "text-[#fbbf24]", dot: "bg-[#fbbf24]" };
    default:
      return { label: "Private", text: "text-muted-foreground", dot: "bg-[#52525b]" };
  }
}

export function deliveryBorderClass(status: ReviewDeliveryStatus): string {
  switch (status) {
    case "selected":
      return "border-[#3b82f6]/30 bg-[#3b82f6]/[0.06]";
    case "delivery_failed":
      return "border-[#f87171]/30";
    case "outdated":
      return "border-dashed border-[#fbbf24]/35";
    default:
      return "border-border";
  }
}

export function inquiryPresentation(state: ReviewInquiryState, isNext: boolean): StatePresentation {
  switch (state) {
    case "running":
      return { label: "Running", text: "text-[#93c5fd]", dot: "bg-[#60a5fa]" };
    case "completed":
      return { label: "Answered", text: "text-[#6ee7b7]", dot: "bg-[#34d399]" };
    case "failed":
      return { label: "Failed", text: "text-[#fca5a5]", dot: "bg-[#f87171]" };
    case "cancelled":
      return { label: "Cancelled", text: "text-[#71717a]", dot: "bg-[#3f3f46]" };
    default:
      return {
        label: isNext ? "Queued · next" : "Queued",
        text: "text-muted-foreground",
        dot: "bg-[#52525b]",
      };
  }
}

export function inquirySourceLabel(sourceKind: string, anchor: ReviewAnchor | null): string {
  if (anchor) {
    const file = anchor.filePath.split("/").at(-1) ?? anchor.filePath;
    return anchor.endLine > anchor.startLine || anchor.startLine > 1
      ? `${file} · ${anchorRangeLabel(anchor)}`
      : file;
  }
  if (sourceKind === "guide_generation") return "Guide generation";
  if (sourceKind === "guide_anchor") return "Guide";
  if (sourceKind === "thread") return "Thread";
  return "This PR";
}
