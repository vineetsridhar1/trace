import { cn } from "../../lib/utils";
import type { CodingToolShape } from "./coding-tool-presentation";

const paths: Record<CodingToolShape, string> = {
  spark: "M9 2.5v13M2.5 9h13M4.4 4.4l9.2 9.2M13.6 4.4l-9.2 9.2",
  prompt: "M3.6 5.4L7.2 9l-3.6 3.6M9.4 12.6h5",
  orbit: "M9 3.2a5.8 5.8 0 100 11.6 5.8 5.8 0 000-11.6zM9 7.6a1.4 1.4 0 100 2.8 1.4 1.4 0 000-2.8z",
  chevron: "M3.6 11.4L9 5.4l5.4 6M3.6 15.1h10.8",
  bracket: "M6.6 3.4H3.4v11.2h3.2M11.4 3.4h3.2v11.2h-3.2M9 6.6v4.8",
};

export function CodingToolMark({
  shape,
  label,
  small = false,
  dimmed = false,
}: {
  shape: CodingToolShape;
  label: string;
  small?: boolean;
  dimmed?: boolean;
}) {
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-[#3f3f46] bg-[#09090b]",
        small ? "size-5 rounded-[5px]" : "size-9 rounded-lg",
        dimmed ? "text-[#a1a1aa]" : "text-[#fafafa]",
      )}
    >
      <svg
        viewBox="0 0 18 18"
        aria-hidden="true"
        className={small ? "size-3" : "size-[18px]"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={paths[shape]} />
      </svg>
    </span>
  );
}
