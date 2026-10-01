import { forwardRef } from "react";
import { CODE_TOKEN_CLASS, highlightCode } from "../code-highlight";
import { type DiffLine } from "../diff-patch";
import { cn } from "../../../lib/utils";

export type DiffLineEmphasis = "none" | "selected" | "asked";

/** Row backgrounds, gutter tints and the inset bar the design uses to mark state. */
function rowClasses(kind: DiffLine["kind"], emphasis: DiffLineEmphasis) {
  if (emphasis === "selected")
    return {
      row: "bg-[var(--th-accent)]/[0.14]",
      gutter:
        "bg-[var(--th-accent)]/[0.22] text-[var(--th-review-comment)] shadow-[inset_2px_0_0_#3b82f6]",
      marker: "text-[var(--th-accent-light)]",
    };
  if (emphasis === "asked")
    return {
      row: "bg-[var(--th-review-ai)]/[0.09]",
      gutter:
        "bg-[var(--th-review-ai)]/[0.16] text-[var(--th-review-ai-light)] shadow-[inset_2px_0_0_#a78bfa]",
      marker: "text-[var(--th-review-ai)]",
    };
  if (kind === "add")
    return {
      row: "bg-[var(--th-success)]/[0.05]",
      gutter: "bg-[var(--th-success)]/[0.08] text-[var(--th-review-text-ghost)]",
      marker: "text-[var(--th-success)]/60",
    };
  if (kind === "delete")
    return {
      row: "bg-[var(--destructive)]/[0.07]",
      gutter: "bg-[var(--destructive)]/[0.1] text-[var(--th-review-text-ghost)]",
      marker: "text-[var(--destructive)]",
    };
  return { row: "", gutter: "text-[var(--th-review-text-ghost)]", marker: "text-transparent" };
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
