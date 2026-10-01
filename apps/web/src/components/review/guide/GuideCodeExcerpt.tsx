import { useMemo } from "react";
import { Button } from "../../ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../ui/accordion";
import { ExternalLink } from "lucide-react";
import { GuideSnippetDiff } from "./GuideSnippetDiff";
import type { ReviewLineSelection } from "../review-selection";
import type { DiffLine } from "../diff-patch";
import { cn } from "../../../lib/utils";
import { guideReferenceKey } from "./guide-content";
import { GuideSnippetExplanation } from "./GuideSnippetExplanation";
import { useGuideExcerpt } from "./useGuideExcerpt";

export function GuideCodeExcerpt({
  reviewId,
  onComment,
  onAsk,
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
  onRegenerate,
}: {
  reviewId: string;
  onComment(selection: ReviewLineSelection): void;
  onAsk(selection: ReviewLineSelection): void;
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
  onRegenerate(): void;
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

  const displayedEndLine = excerpt?.endLine ?? endLine;
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
      <div className="border-b border-[var(--th-review-card-edge)] px-4 py-3">
        <Accordion>
          <AccordionItem value="info">
            <AccordionTrigger
              className="min-w-0 items-center gap-2 py-0 text-sm font-medium text-foreground"
              aria-label={title}
            >
              <span className="min-w-0 truncate" title={title}>
                <span className="mr-2 text-muted-foreground">{step}.</span>
                {title}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-2 pb-0">
              {explanation.trim() ? (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Why this code is here
                  </span>
                  <p className="whitespace-pre-line text-sm leading-6 text-[var(--th-review-text-mid)]">
                    <GuideSnippetExplanation
                      text={explanation}
                      snapshotId={snapshotId}
                      filePath={filePath}
                    />
                  </p>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  <p>
                    This saved snippet has no explanation. Regenerate the Guide to explain its role
                    in the chapter.
                  </p>
                  <Button variant="ghost" size="sm" onClick={onRegenerate}>
                    Regenerate Guide
                  </Button>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
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
          {displayedEndLine !== startLine ? `–${displayedEndLine}` : ""}
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
        <GuideSnippetDiff
          reviewId={reviewId}
          snapshotId={snapshotId}
          filePath={filePath}
          lines={lines}
          onComment={onComment}
          onAsk={onAsk}
        />
      ) : null}
    </div>
  );
}
