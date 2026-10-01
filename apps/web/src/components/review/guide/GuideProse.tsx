import { cn } from "../../../lib/utils";
import {
  anchorsEqual,
  guideAnchorLabel,
  type GuideAnchor,
  type GuideSegment,
} from "./guide-content";

export function GuideProse({
  segments,
  activeAnchor,
  size = "body",
  onAnchor,
}: {
  segments: GuideSegment[];
  activeAnchor: GuideAnchor | null;
  size?: "body" | "note";
  onAnchor(anchor: GuideAnchor): void;
}) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === "text" ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <button
            key={index}
            type="button"
            onClick={() => onAnchor(segment.anchor)}
            className={cn(
              "whitespace-nowrap rounded px-1.5 font-mono font-medium",
              size === "body" ? "text-[12.5px]" : "text-xs",
              anchorsEqual(activeAnchor, segment.anchor)
                ? "bg-[var(--th-accent)]/[0.34] text-white ring-1 ring-[var(--th-accent)]"
                : "bg-[var(--th-accent)]/10 text-[var(--th-review-comment)] hover:bg-[var(--th-accent)]/20",
            )}
          >
            {segment.label}
            <span className="opacity-65">{guideAnchorLabel(segment.anchor)}</span>
          </button>
        ),
      )}
    </>
  );
}
