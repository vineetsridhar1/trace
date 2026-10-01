import { MessageSquare, Sparkles } from "lucide-react";
import { cn } from "../../../lib/utils";
import { GuideProse } from "./GuideProse";
import type { GuideAnchor, GuideChapterContent } from "./guide-content";

export function GuideChapterAside({
  chapter,
  index,
  total,
  activeAnchor,
  onAnchor,
  onAsk,
  onComment,
}: {
  chapter: GuideChapterContent;
  index: number;
  total: number;
  activeAnchor: GuideAnchor | null;
  onAnchor(anchor: GuideAnchor): void;
  onAsk(): void;
  onComment(): void;
}) {
  return (
    <div className="sticky top-0 flex flex-col gap-[18px] px-10 pb-7 pt-7">
      <span className="font-mono text-[11px] font-medium text-muted-foreground">
        CHAPTER {index + 1} OF {total}
      </span>
      <h2 className="m-0 text-balance text-2xl font-semibold leading-[1.25] tracking-[-0.015em] text-[var(--th-review-text)]">
        {chapter.title}
      </h2>
      {chapter.paragraphs.map((paragraph, paragraphIndex) => (
        <p
          key={paragraphIndex}
          className="m-0 text-pretty text-[14.5px] leading-[1.8] text-[var(--th-review-text-mid)]"
        >
          <GuideProse segments={paragraph} activeAnchor={activeAnchor} onAnchor={onAnchor} />
        </p>
      ))}
      {chapter.implications.length > 0 ? (
        <div className="flex flex-col gap-[9px]">
          <span className="text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground">
            WORTH A LOOK
          </span>
          {chapter.implications.map((implication, implicationIndex) => (
            <div
              key={implicationIndex}
              className="flex gap-3 text-[13.5px] leading-[1.7] text-[var(--th-review-text-mid)]"
            >
              <span className="mt-2.5 size-[5px] shrink-0 rounded-full bg-[var(--th-warn)]" />
              <span className="text-pretty">
                <GuideProse
                  segments={implication}
                  activeAnchor={activeAnchor}
                  size="note"
                  onAnchor={onAnchor}
                />
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {chapter.references.length > 0 ? (
        <div className="flex flex-col gap-0.5 pt-1">
          <span className="pb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground">
            CODE PATH
          </span>
          {chapter.references.map((reference, step) => {
            const path = reference.filePath;
            const active =
              activeAnchor?.filePath === path &&
              activeAnchor.startLine === reference.startLine &&
              activeAnchor.endLine === reference.endLine;
            return (
              <button
                key={`${path}:${reference.startLine}:${reference.endLine}`}
                type="button"
                onClick={() => onAnchor(reference)}
                className={cn(
                  "flex items-center gap-2.5 py-[5px] text-left font-mono text-xs",
                  active
                    ? "text-[var(--th-review-text)]"
                    : "text-[var(--th-primary)] hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    active ? "bg-[var(--th-accent)]" : "bg-[var(--th-review-edge-raised)]",
                  )}
                />
                <span className="min-w-0 flex-1 truncate" title={path}>
                  {step + 1}. {reference.title}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  L{reference.startLine}–{reference.endLine}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="flex items-center gap-2 text-xs font-medium">
        <button
          type="button"
          onClick={onAsk}
          className="flex h-[30px] items-center gap-[7px] rounded-[7px] border border-[var(--th-review-ai)]/30 px-[11px] text-[var(--th-review-ai-light)] hover:bg-[var(--th-review-ai)]/10"
        >
          <Sparkles size={11} /> Ask about this
        </button>
        <button
          type="button"
          onClick={onComment}
          className="flex h-[30px] items-center gap-[7px] rounded-[7px] border border-[var(--th-edge)] px-[11px] text-[var(--th-heading)] hover:bg-white/5"
        >
          <MessageSquare size={11} /> Comment
        </button>
      </div>
    </div>
  );
}
