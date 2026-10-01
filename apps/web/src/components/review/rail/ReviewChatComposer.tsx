import { useState } from "react";
import { ArrowUp, X } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { ReviewLineSelection } from "../review-selection";
import { selectionRangeLabel } from "../review-selection";

export function ReviewChatComposer({
  attachment,
  queuedAhead,
  submitting,
  onClearAttachment,
  onSubmit,
}: {
  attachment: ReviewLineSelection | null;
  queuedAhead: number;
  submitting: boolean;
  onClearAttachment(): void;
  onSubmit(question: string): void;
}) {
  const [question, setQuestion] = useState("");
  const [focused, setFocused] = useState(false);
  const send = () => {
    if (!question.trim() || submitting) return;
    onSubmit(question.trim());
    setQuestion("");
  };
  return (
    <div className="shrink-0 border-t border-[#1f1f23] px-3.5 pb-3.5 pt-3">
      <div
        className={cn(
          "flex flex-col gap-2.5 rounded-[10px] border bg-[#171717] p-2.5",
          focused ? "border-[#3b82f6] shadow-[0_0_0_3px_rgba(59,130,246,.12)]" : "border-[#2e2e33]",
        )}
      >
        {attachment ? (
          <span className="flex w-fit items-center gap-1.5 self-start rounded-[5px] bg-[#3b82f6]/[0.14] px-[7px] py-0.5 font-mono text-[10.5px] font-medium text-[#93c5fd]">
            {attachment.filePath.split("/").at(-1)} &middot;{" "}
            {selectionRangeLabel({
              side: attachment.side,
              start: attachment.startLine,
              end: attachment.endLine,
            })}
            <button type="button" onClick={onClearAttachment} aria-label="Remove attached lines">
              <X size={10} className="text-[#60a5fa]" />
            </button>
          </span>
        ) : null}
        <textarea
          value={question}
          rows={1}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Ask about this PR…"
          className="max-h-32 w-full resize-none bg-transparent text-[13px] outline-none placeholder:text-[#5c5c66]"
        />
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {attachment
              ? queuedAhead > 0
                ? `Runs after ${queuedAhead} in queue`
                : "Runs next"
              : "Select lines to attach context"}
          </span>
          <button
            type="button"
            onClick={send}
            disabled={!question.trim() || submitting}
            aria-label="Send question"
            className="flex size-[26px] items-center justify-center rounded-[7px] bg-[#ededef] text-[#111] disabled:opacity-40"
          >
            <ArrowUp size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
