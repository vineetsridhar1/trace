import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { DiffLineRow } from "../diff/DiffLineRow";
import type { DiffLine } from "../diff-patch";
import { cn } from "../../../lib/utils";
import { guideReferenceKey } from "./guide-content";
import { useGuideExcerpt } from "./useGuideExcerpt";

export function GuideCodeExcerpt({
  snapshotId,
  filePath,
  startLine,
  endLine,
  title,
  explanation,
  step,
  active,
  inChanges,
  onOpen,
}: {
  snapshotId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  title: string;
  explanation: string;
  step: number;
  active: boolean;
  inChanges: boolean;
  onOpen(): void;
}) {
  const { cardRef, excerpt, error } = useGuideExcerpt(
    snapshotId,
    filePath,
    startLine,
    endLine,
    active,
  );
  const lines = useMemo<DiffLine[]>(() => {
    if (!excerpt) return [];
    const added = new Set(excerpt.addedLines);
    return excerpt.content.split("\n").map((text, index) => ({
      text,
      kind: added.has(startLine + index) ? "add" : "context",
      oldLine: null,
      newLine: startLine + index,
    }));
  }, [excerpt, startLine]);

  return (
    <div
      ref={cardRef}
      data-guide-file={filePath}
      data-guide-reference={guideReferenceKey({ filePath, startLine, endLine })}
      className={cn(
        "min-w-0 scroll-mt-4 overflow-clip rounded-[9px] border border-[var(--th-review-card-edge)] bg-[var(--th-review-card)]",
        active && "ring-1 ring-[var(--th-accent)]",
      )}
    >
      <div className="space-y-2 border-b border-[var(--th-review-card-edge)] px-4 py-3">
        <h3 className="text-sm font-medium text-foreground">
          <span className="mr-2 text-muted-foreground">{step}.</span>
          {title}
        </h3>
        {explanation ? (
          <p className="text-sm leading-6 text-muted-foreground">{explanation}</p>
        ) : null}
      </div>
      <header className="sticky top-0 z-[1] flex min-h-10 flex-wrap items-center gap-2 border-b border-[var(--th-review-card-edge)] bg-[var(--th-surface)] px-3.5 py-2">
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
          title={filePath}
        >
          {filePath}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          L{startLine}
          {endLine !== startLine ? `–${endLine}` : ""}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="ml-auto flex shrink-0 items-center gap-1 text-xs text-[var(--th-review-comment)] hover:underline"
        >
          {inChanges ? "Open in Changes" : "Open source"} <ExternalLink size={10} />
        </button>
      </header>
      {error ? <p className="p-4 text-xs text-destructive">{error}</p> : null}
      {!error && !excerpt ? <div className="h-24 animate-pulse bg-muted/10" /> : null}
      {excerpt ? (
        <div className="native-scrollbar min-w-0 overflow-x-auto py-1 font-mono text-xs leading-5">
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
      ) : null}
    </div>
  );
}
