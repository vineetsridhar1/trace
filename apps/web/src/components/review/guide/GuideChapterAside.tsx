import { MessageSquare, Sparkles } from "lucide-react";
import type { ReviewFile } from "@trace/gql";
import { cn } from "../../../lib/utils";
import { GuideProse } from "./GuideProse";
import type { GuideAnchor, GuideChapterContent } from "./guide-content";

export function GuideChapterAside({
  chapter,
  index,
  total,
  activeAnchor,
  activeFilePath,
  filesByPath,
  onAnchor,
  onFile,
  onAsk,
  onComment,
}: {
  chapter: GuideChapterContent;
  index: number;
  total: number;
  activeAnchor: GuideAnchor | null;
  activeFilePath: string | null;
  filesByPath: Map<string, ReviewFile>;
  onAnchor(anchor: GuideAnchor): void;
  onFile(filePath: string): void;
  onAsk(): void;
  onComment(): void;
}) {
  return (
    <div className="flex flex-col gap-[18px] border-r border-[#1f1f23] px-10 pb-7 pt-7">
      <span className="font-mono text-[11px] font-medium text-muted-foreground">
        CHAPTER {index + 1} OF {total}
      </span>
      <h2 className="m-0 text-balance text-2xl font-semibold leading-[1.25] tracking-[-0.015em] text-[#ededef]">
        {chapter.title}
      </h2>
      {chapter.paragraphs.map((paragraph, paragraphIndex) => (
        <p
          key={paragraphIndex}
          className="m-0 text-pretty text-[14.5px] leading-[1.8] text-[#bdbdc4]"
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
              className="flex gap-3 text-[13.5px] leading-[1.7] text-[#bdbdc4]"
            >
              <span className="mt-2.5 size-[5px] shrink-0 rounded-full bg-[#fbbf24]" />
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
      {chapter.files.length > 0 ? (
        <div className="flex flex-col gap-0.5 pt-1">
          <span className="pb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground">
            FILES IN THIS CHAPTER
          </span>
          {chapter.files.map((path) => {
            const file = filesByPath.get(path);
            const active = activeFilePath === path;
            return (
              <button
                key={path}
                type="button"
                onClick={() => onFile(path)}
                className={cn(
                  "flex items-center gap-2.5 py-[5px] text-left font-mono text-xs",
                  active ? "text-[#ededef]" : "text-[#a1a1aa] hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    active ? "bg-[#3b82f6]" : "bg-[#3f3f46]",
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{path}</span>
                {file ? (
                  <span className="shrink-0 text-[11px] text-[#34d399]">+{file.additions}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="flex items-center gap-2 text-xs font-medium">
        <button
          type="button"
          onClick={onAsk}
          className="flex h-[30px] items-center gap-[7px] rounded-[7px] border border-[#a78bfa]/30 px-[11px] text-[#c4b5fd] hover:bg-[#a78bfa]/10"
        >
          <Sparkles size={11} /> Ask about this
        </button>
        <button
          type="button"
          onClick={onComment}
          className="flex h-[30px] items-center gap-[7px] rounded-[7px] border border-[#262626] px-[11px] text-[#d4d4d8] hover:bg-white/5"
        >
          <MessageSquare size={11} /> Comment
        </button>
      </div>
    </div>
  );
}
