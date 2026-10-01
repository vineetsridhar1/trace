import { forwardRef } from "react";
import { CODE_TOKEN_CLASS, highlightCode } from "../code-highlight";
import { type DiffLine } from "../diff-patch";
import { cn } from "../../../lib/utils";

export type DiffLineEmphasis = "none" | "selected" | "asked";

/** Row backgrounds, gutter tints and the inset bar the design uses to mark state. */
function rowClasses(kind: DiffLine["kind"], emphasis: DiffLineEmphasis) {
  if (emphasis === "selected")
    return {
      row: "bg-[#3b82f6]/[0.14]",
      gutter: "bg-[#3b82f6]/[0.22] text-[#93c5fd] shadow-[inset_2px_0_0_#3b82f6]",
      marker: "text-[#60a5fa]",
    };
  if (emphasis === "asked")
    return {
      row: "bg-[#a78bfa]/[0.09]",
      gutter: "bg-[#a78bfa]/[0.16] text-[#c4b5fd] shadow-[inset_2px_0_0_#a78bfa]",
      marker: "text-[#a78bfa]",
    };
  if (kind === "add")
    return {
      row: "bg-[#34d399]/[0.05]",
      gutter: "bg-[#34d399]/[0.08] text-[#5c5c66]",
      marker: "text-[#34d399]/60",
    };
  if (kind === "delete")
    return {
      row: "bg-[#f87171]/[0.07]",
      gutter: "bg-[#f87171]/[0.1] text-[#5c5c66]",
      marker: "text-[#f87171]",
    };
  return { row: "", gutter: "text-[#5c5c66]", marker: "text-transparent" };
}

export const DiffLineRow = forwardRef<
  HTMLDivElement,
  {
    line: DiffLine;
    emphasis: DiffLineEmphasis;
    lineNumber: number | null;
    onPointerDown?(event: React.PointerEvent): void;
    onPointerEnter?(): void;
  }
>(function DiffLineRow({ line, emphasis, lineNumber, onPointerDown, onPointerEnter }, ref) {
  const classes = rowClasses(line.kind, emphasis);
  const marker = line.kind === "add" ? "+" : line.kind === "delete" ? "−" : " ";
  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      className={cn(
        "flex h-5 w-full min-w-full select-none",
        classes.row,
        lineNumber != null && "cursor-text",
      )}
    >
      <span
        className={cn(
          "w-[46px] shrink-0 box-border pr-2.5 text-right tabular-nums",
          classes.gutter,
        )}
      >
        {lineNumber ?? ""}
      </span>
      <span className={cn("w-[18px] shrink-0 text-center", classes.marker)}>{marker}</span>
      <span className="min-w-max flex-none whitespace-pre pr-4">
        {highlightCode(line.text).map((token, index) => (
          <span key={index} className={CODE_TOKEN_CLASS[token.kind]}>
            {token.text}
          </span>
        ))}
      </span>
    </div>
  );
});
