import { useMemo } from "react";
import type { ReviewInquiry, ReviewThread } from "@trace/gql";
import { cn } from "../../../lib/utils";
import type { ReviewRailTab, ReviewThreadFilter } from "../../../stores/review-ui";
import type { ReviewLineSelection } from "../review-selection";
import { ReviewChatComposer } from "./ReviewChatComposer";
import { ReviewChatTab } from "./ReviewChatTab";
import { ReviewThreadsTab } from "./ReviewThreadsTab";

interface ReviewRailProps {
  tab: ReviewRailTab;
  threadFilter: ReviewThreadFilter;
  inquiries: ReviewInquiry[];
  threads: ReviewThread[];
  attachment: ReviewLineSelection | null;
  sessionLabel: string;
  submitting: boolean;
  selectedCount: number;
  onTab(tab: ReviewRailTab): void;
  onThreadFilter(filter: ReviewThreadFilter): void;
  onClearAttachment(): void;
  onAsk(question: string): void;
  onOpenReference(filePath: string, startLine: number): void;
  onTurnIntoComment(inquiry: ReviewInquiry): void;
  onOpenThread(thread: ReviewThread): void;
  onSubmitReview(): void;
}

export function ReviewRail({
  tab,
  threadFilter,
  inquiries,
  threads,
  attachment,
  sessionLabel,
  submitting,
  selectedCount,
  onTab,
  onThreadFilter,
  onClearAttachment,
  onAsk,
  onOpenReference,
  onTurnIntoComment,
  onOpenThread,
  onSubmitReview,
}: ReviewRailProps) {
  const queued = inquiries.filter((inquiry) => inquiry.state === "queued");
  const running = inquiries.filter((inquiry) => inquiry.state === "running");
  const ordered = useMemo(
    () => [...inquiries].sort((a, b) => a.position - b.position),
    [inquiries],
  );

  return (
    <aside className="flex h-full w-[356px] shrink-0 flex-col border-l border-[#1f1f23] bg-[#111111]">
      <div className="flex h-12 shrink-0 items-end gap-[18px] border-b border-[#1f1f23] px-4 text-[12.5px] font-medium">
        {[
          { id: "chat" as const, label: "Chat", count: inquiries.length },
          { id: "threads" as const, label: "Threads", count: threads.length },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTab(item.id)}
            aria-pressed={tab === item.id}
            className={cn(
              "pb-3",
              tab === item.id
                ? "text-[#ededef] shadow-[inset_0_-2px_0_#ededef]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}{" "}
            <span className={tab === item.id ? "text-muted-foreground" : "text-[#5c5c66]"}>
              {item.count}
            </span>
          </button>
        ))}
        {tab === "chat" ? (
          <span className="ml-auto pb-3 text-[11px] text-muted-foreground">
            {running.length} running &middot; {queued.length} queued
          </span>
        ) : null}
      </div>
      {tab === "chat" ? (
        <>
          <p className="m-0 shrink-0 px-4 pt-2.5 text-[11.5px] text-muted-foreground">
            Asks the attached session &middot; {sessionLabel}
          </p>
          <ReviewChatTab
            inquiries={ordered}
            nextQueuedId={queued[0]?.id ?? null}
            onOpenReference={onOpenReference}
            onTurnIntoComment={onTurnIntoComment}
          />
          <ReviewChatComposer
            attachment={attachment}
            queuedAhead={queued.length + running.length}
            submitting={submitting}
            onClearAttachment={onClearAttachment}
            onSubmit={onAsk}
          />
        </>
      ) : (
        <>
          <ReviewThreadsTab
            threads={threads}
            filter={threadFilter}
            onFilter={onThreadFilter}
            onOpen={onOpenThread}
          />
          <div className="flex shrink-0 items-center gap-2 border-t border-[#1f1f23] px-3.5 pb-3.5 pt-3">
            <button
              type="button"
              onClick={onSubmitReview}
              disabled={selectedCount === 0}
              className="flex h-[34px] flex-1 items-center justify-center rounded-[7px] bg-gradient-to-b from-[#4d8ff8] to-[#2f6fd8] text-[12.5px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_1px_3px_rgba(0,0,0,.4)] disabled:opacity-40"
            >
              {selectedCount > 0 ? `Send ${selectedCount} to GitHub` : "Select threads to send"}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
