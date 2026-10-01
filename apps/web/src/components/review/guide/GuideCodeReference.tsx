import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "../../ui/popover";
import { DiffLineRow } from "../diff/DiffLineRow";
import type { DiffLine } from "../diff-patch";
import { useGuideExcerpt } from "./useGuideExcerpt";

export function GuideCodeReference({
  snapshotId,
  filePath,
  startLine,
  endLine,
  label,
}: {
  snapshotId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  // No observer ref: references fetch only after a click, never as prose enters the viewport.
  const { excerpt, error } = useGuideExcerpt(snapshotId, filePath, startLine, endLine, open);
  const lines = useMemo<DiffLine[]>(() => {
    if (!excerpt) return [];
    const added = new Set(excerpt.addedLines);
    return excerpt.content.split("\n").map((text, index) => ({
      text,
      kind: added.has(excerpt.startLine + index) ? "add" : "context",
      oldLine: null,
      newLine: excerpt.startLine + index,
    }));
  }, [excerpt]);
  const lastLine = excerpt?.endLine ?? endLine;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title={`${filePath}:${startLine}–${endLine}`}
        className="inline rounded px-0.5 text-[var(--th-review-comment)] underline decoration-dotted underline-offset-4 hover:bg-[var(--th-accent)]/10 focus-visible:outline-2 focus-visible:outline-ring"
      >
        {label}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(640px,calc(100vw-2rem))] gap-0 overflow-hidden p-0"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <PopoverTitle className="min-w-0 flex-1 break-all font-mono text-xs">
            {filePath}
          </PopoverTitle>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            L{startLine}
            {lastLine !== startLine ? `–${lastLine}` : ""}
          </span>
          <button
            type="button"
            aria-label="Close code preview"
            onClick={() => setOpen(false)}
            className="rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X size={14} />
          </button>
        </div>
        {error ? (
          <p role="alert" className="p-3 text-xs text-destructive">
            {error}
          </p>
        ) : excerpt ? (
          <div className="native-scrollbar max-h-[min(360px,50vh)] overflow-auto py-1 font-mono text-xs leading-5">
            <div className="min-w-max">
              {lines.map((line) => (
                <DiffLineRow
                  key={line.newLine}
                  line={line}
                  lineNumber={line.newLine}
                  emphasis="none"
                />
              ))}
            </div>
          </div>
        ) : (
          <p role="status" className="p-3 text-xs text-muted-foreground">
            Loading code…
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
