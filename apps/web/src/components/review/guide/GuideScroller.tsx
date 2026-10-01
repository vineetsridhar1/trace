import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "../../ui/button";
import type { ReviewFile } from "@trace/gql";
import { GuideChapterAside } from "./GuideChapterAside";
import { GuideCodeExcerpt } from "./GuideCodeExcerpt";
import {
  anchorsEqual,
  guideReferenceKey,
  type GuideAnchor,
  type GuideContent,
} from "./guide-content";

interface GuideScrollerProps {
  reviewId: string;
  guideId: string;
  snapshotId: string;
  content: GuideContent;
  files: ReviewFile[];
  onOpenReference(anchor: GuideAnchor): void;
  onOpenInChanges(anchor: GuideAnchor): void;
  onAskAboutChapter(chapterId: string): void;
  onCommentOnChapter(chapterId: string): void;
  onReviewAllChanges(): void;
  onRegenerate(): void;
}

export function GuideScroller({
  reviewId,
  guideId,
  snapshotId,
  content,
  files,
  onOpenInChanges,
  onOpenReference,
  onAskAboutChapter,
  onCommentOnChapter,
  onReviewAllChanges,
  onRegenerate,
}: GuideScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<(GuideAnchor & { chapterIndex: number }) | null>(null);
  const filesByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const referencedCount = useMemo(
    () =>
      new Set(
        content.chapters
          .flatMap((chapter) => chapter.references.map((reference) => reference.filePath))
          .filter((path) => filesByPath.has(path)),
      ).size,
    [content.chapters, filesByPath],
  );

  const scrollToSelector = useCallback((selector: string) => {
    scrollRef.current?.querySelector(selector)?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  }, []);

  const jumpToAnchor = useCallback(
    (next: GuideAnchor, preferredChapter?: number) => {
      const contains = (index: number) =>
        content.chapters[index]?.references.some((reference) => anchorsEqual(reference, next));
      const chapterIndex =
        preferredChapter !== undefined && contains(preferredChapter)
          ? preferredChapter
          : content.chapters.findIndex((_, index) => contains(index));
      if (chapterIndex >= 0) {
        setAnchor({ ...next, chapterIndex });
        scrollToSelector(
          `[data-guide-chapter="${chapterIndex}"] [data-guide-reference="${CSS.escape(guideReferenceKey(next))}"]`,
        );
      } else if (filesByPath.has(next.filePath)) onOpenInChanges(next);
      else onOpenReference(next);
    },
    [content.chapters, filesByPath, onOpenInChanges, onOpenReference, scrollToSelector],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--th-review-canvas)]">
      <div ref={scrollRef} className="native-scrollbar relative min-h-0 flex-1 overflow-y-auto">
        {content.chapters.map((chapter, index) => (
          <div
            key={chapter.id}
            data-guide-chapter={index}
            className="grid border-b border-[var(--th-review-edge)] [grid-template-columns:minmax(0,560px)_minmax(0,1fr)]"
          >
            <div className="min-w-0 border-r border-[var(--th-edge-faint)]">
              <GuideChapterAside
                reviewId={reviewId}
                guideId={guideId}
                snapshotId={snapshotId}
                chapter={chapter}
                index={index}
                total={content.chapters.length}
                activeAnchor={anchor?.chapterIndex === index ? anchor : null}
                onAnchor={(next) => jumpToAnchor(next, index)}
                onAsk={() => onAskAboutChapter(chapter.id)}
                onComment={() => onCommentOnChapter(chapter.id)}
              />
            </div>
            <div className="flex flex-col gap-[18px] bg-[var(--th-review-card-deep)] px-5 pb-7 pt-5">
              {chapter.references.map((reference, step) => (
                <GuideCodeExcerpt
                  key={`${snapshotId}:${guideReferenceKey(reference)}`}
                  snapshotId={snapshotId}
                  filePath={reference.filePath}
                  startLine={reference.startLine}
                  endLine={reference.endLine}
                  title={reference.title}
                  explanation={reference.explanation}
                  step={step + 1}
                  active={anchor?.chapterIndex === index && anchorsEqual(anchor, reference)}
                  inChanges={filesByPath.has(reference.filePath)}
                  onOpen={() =>
                    filesByPath.has(reference.filePath)
                      ? onOpenInChanges(reference)
                      : onOpenReference(reference)
                  }
                />
              ))}
              {chapter.references.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  This chapter has no precise code references. Regenerate the Guide for a code
                  walkthrough.
                </p>
              ) : null}
            </div>
          </div>
        ))}
        {content.everythingElse.length > 0 ? (
          <div className="flex flex-col gap-2.5 border-b border-[var(--th-review-edge)] px-11 py-7">
            <span className="text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground">
              EVERYTHING ELSE
            </span>
            <div className="flex flex-wrap gap-1.5">
              {content.everythingElse.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => jumpToAnchor({ filePath: path, startLine: 1, endLine: 1 })}
                  className="rounded-md border border-[var(--th-edge)] px-2 py-1 font-mono text-[11px] text-[var(--th-primary)] hover:text-foreground"
                >
                  {path}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex h-[220px] flex-col items-center justify-center gap-2.5">
          <span className="text-[15px] font-semibold text-[var(--th-review-text)]">
            End of guide
          </span>
          <span className="text-[12.5px] text-muted-foreground">
            {content.chapters.length} chapter{content.chapters.length === 1 ? "" : "s"} &middot;{" "}
            {referencedCount} changed file{referencedCount === 1 ? "" : "s"} referenced
          </span>
          <button
            type="button"
            onClick={onReviewAllChanges}
            className="mt-1.5 flex h-[30px] items-center rounded-[7px] border border-[var(--th-edge)] px-3 text-xs font-medium text-[var(--th-heading)] hover:bg-white/5"
          >
            Review all changes &rarr;
          </button>
          <Button variant="ghost" size="sm" onClick={onRegenerate}>
            Regenerate Guide
          </Button>
        </div>
      </div>
    </div>
  );
}
