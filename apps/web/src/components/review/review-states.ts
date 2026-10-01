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
      text: "text-[var(--th-review-comment)]",
      dot: "bg-[var(--th-accent-light)]",
    };
  if (status === "ambiguous")
    return {
      label: "Ambiguous",
      text: "text-[var(--th-review-ai-light)]",
      dot: "bg-[var(--th-review-ai)]",
    };
  if (status === "outdated")
    return {
      label: "Line no longer exists",
      text: "text-[var(--th-warn)]",
      dot: "bg-[var(--th-warn)]",
    };
  return {
    label: anchorRangeLabel(anchor),
    text: "text-[var(--th-review-success-light)]",
    dot: "bg-[var(--th-success)]",
  };
}

export function anchorRangeLabel(anchor: ReviewAnchor): string {
  return anchor.endLine === anchor.startLine
    ? `L${anchor.startLine}`
    : `L${anchor.startLine}–${anchor.endLine}`;
}

export function deliveryPresentation(status: ReviewDeliveryStatus): StatePresentation {
  switch (status) {
    case "selected":
      return {
        label: "In GitHub review",
        text: "text-[var(--th-review-comment)]",
        dot: "bg-[var(--th-accent)]",
      };
    case "delivered":
      return {
        label: "Delivered",
        text: "text-[var(--th-review-success-light)]",
        dot: "bg-[var(--th-success)]",
      };
    case "delivery_failed":
      return {
        label: "Failed",
        text: "text-[var(--th-review-danger-light)]",
        dot: "bg-[var(--destructive)]",
      };
    case "outdated":
      return { label: "Outdated", text: "text-[var(--th-warn)]", dot: "bg-[var(--th-warn)]" };
    default:
      return { label: "Private", text: "text-muted-foreground", dot: "bg-[var(--th-faint)]" };
  }
}

export function deliveryBorderClass(status: ReviewDeliveryStatus): string {
  switch (status) {
    case "selected":
      return "border-[var(--th-accent)]/30 bg-[var(--th-accent)]/[0.06]";
    case "delivery_failed":
      return "border-[var(--destructive)]/30";
    case "outdated":
      return "border-dashed border-[var(--th-warn)]/35";
    default:
      return "border-border";
  }
}

export function inquiryPresentation(state: ReviewInquiryState, isNext: boolean): StatePresentation {
  switch (state) {
    case "running":
      return {
        label: "Running",
        text: "text-[var(--th-review-comment)]",
        dot: "bg-[var(--th-accent-light)]",
      };
    case "completed":
      return {
        label: "Answered",
        text: "text-[var(--th-review-success-light)]",
        dot: "bg-[var(--th-success)]",
      };
    case "failed":
      return {
        label: "Failed",
        text: "text-[var(--th-review-danger-light)]",
        dot: "bg-[var(--destructive)]",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        text: "text-[var(--th-review-text-faint)]",
        dot: "bg-[var(--th-review-edge-raised)]",
      };
    default:
      return {
        label: isNext ? "Queued · next" : "Queued",
        text: "text-muted-foreground",
        dot: "bg-[var(--th-faint)]",
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
