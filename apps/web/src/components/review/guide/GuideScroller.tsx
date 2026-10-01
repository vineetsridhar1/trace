import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReviewFile } from "@trace/gql";
import { GuideChapterAside } from "./GuideChapterAside";
import { GuideFileDiff } from "./GuideFileDiff";
import { anchorsEqual, type GuideAnchor, type GuideContent } from "./guide-content";

interface GuideScrollerProps {
  snapshotId: string;
  content: GuideContent;
  files: ReviewFile[];
  onOpenInChanges(anchor: GuideAnchor): void;
  onAskAboutChapter(chapterId: string): void;
  onCommentOnChapter(chapterId: string): void;
  onReviewAllChanges(): void;
}

export function GuideScroller({
  snapshotId,
  content,
  files,
  onOpenInChanges,
  onAskAboutChapter,
  onCommentOnChapter,
  onReviewAllChanges,
}: GuideScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeChapter, setActiveChapter] = useState(0);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<GuideAnchor | null>(null);
  const filesByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);
  const coveredCount = useMemo(
    () => content.chapters.reduce((total, chapter) => total + chapter.files.length, 0),
    [content.chapters],
  );

  const scrollToSelector = useCallback((selector: string) => {
    scrollRef.current?.querySelector(selector)?.scrollIntoView({
      block: "start",
      behavior: "smooth",
    });
  }, []);

  // The pinned chapter and the active file both follow scroll position, exactly like the sidebar
  // follows the Changes view, so the reader always knows where they are in the walkthrough. The
  // measurement reads one rect per chapter and per file, so it is coalesced onto an animation
  // frame rather than run on every scroll event.
  const frameRef = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const container = scrollRef.current;
      if (!container) return;
      const top = container.getBoundingClientRect().top;
      let chapter = 0;
      let file: string | null = activeFilePath;
      for (const element of container.querySelectorAll<HTMLElement>("[data-guide-chapter]")) {
        if (element.getBoundingClientRect().top - top <= 40)
          chapter = Number(element.dataset.guideChapter);
      }
      for (const element of container.querySelectorAll<HTMLElement>("[data-guide-file]")) {
        if (element.getBoundingClientRect().top - top <= 260)
          file = element.dataset.guideFile ?? null;
      }
      if (chapter !== activeChapter) setActiveChapter(chapter);
      if (file !== activeFilePath) setActiveFilePath(file);
    });
  }, [activeChapter, activeFilePath]);
  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const jumpToAnchor = useCallback(
    (next: GuideAnchor) => {
      setAnchor((current) => (anchorsEqual(current, next) ? current : next));
      setActiveFilePath(next.filePath);
      scrollToSelector(`[data-guide-file="${CSS.escape(next.filePath)}"]`);
    },
    [scrollToSelector],
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--th-review-canvas)]">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="native-scrollbar relative min-h-0 flex-1 overflow-y-auto"
      >
        {content.chapters.map((chapter, index) => (
          <div
            key={chapter.id}
            data-guide-chapter={index}
            className="grid border-b border-[var(--th-review-edge)] [grid-template-columns:minmax(0,560px)_minmax(0,1fr)]"
          >
            <GuideChapterAside
              chapter={chapter}
              index={index}
              total={content.chapters.length}
              activeAnchor={anchor}
              activeFilePath={activeChapter === index ? activeFilePath : null}
              filesByPath={filesByPath}
              onAnchor={jumpToAnchor}
              onFile={(filePath) => jumpToAnchor({ filePath, startLine: 1, endLine: 1 })}
              onAsk={() => onAskAboutChapter(chapter.id)}
              onComment={() => onCommentOnChapter(chapter.id)}
            />
            <div className="flex flex-col gap-[18px] bg-[var(--th-review-card-deep)] px-5 pb-7 pt-5">
              {chapter.files.map((filePath) => (
                <GuideFileDiff
                  // Same reason as the Changes cards: a new snapshot must remount so the card
                  // cannot keep serving the previous commit's cached patch.
                  key={`${snapshotId}:${filePath}`}
                  snapshotId={snapshotId}
                  filePath={filePath}
                  highlight={anchor?.filePath === filePath ? anchor : null}
                  onOpenInChanges={() =>
                    onOpenInChanges(
                      anchor?.filePath === filePath
                        ? anchor
                        : { filePath, startLine: 1, endLine: 1 },
                    )
                  }
                />
              ))}
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
                  onClick={() => onOpenInChanges({ filePath: path, startLine: 1, endLine: 1 })}
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
            {coveredCount} of {files.length} file{files.length === 1 ? "" : "s"} covered
          </span>
          <button
            type="button"
            onClick={onReviewAllChanges}
            className="mt-1.5 flex h-[30px] items-center rounded-[7px] border border-[var(--th-edge)] px-3 text-xs font-medium text-[var(--th-heading)] hover:bg-white/5"
          >
            Review all changes &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
