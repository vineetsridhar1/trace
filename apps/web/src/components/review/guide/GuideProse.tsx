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
                ? "bg-[#3b82f6]/[0.34] text-white ring-1 ring-[#3b82f6]"
                : "bg-[#3b82f6]/10 text-[#93c5fd] hover:bg-[#3b82f6]/20",
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
