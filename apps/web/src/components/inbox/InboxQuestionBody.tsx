import { X, Send, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuestionState } from "@trace/client-core";
import type { Question, QuestionOption } from "@trace/shared";
import { cn } from "../../lib/utils";
import { PendingRichTextInput } from "../session/PendingRichTextInput";

export type QuestionData = Question;

interface InboxQuestionBodyProps {
  questions: QuestionData[];
  sending: boolean;
  onSend: (text: string) => void;
  onDismiss: () => void;
}

export function InboxQuestionBody({
  questions,
  sending,
  onSend,
  onDismiss,
}: InboxQuestionBodyProps) {
  const {
    page,
    total,
    question: q,
    currentSelected,
    currentCustom,
    isFirstPage,
    isLastPage,
    hasAllAnswers,
    toggleOption,
    setCustomText,
    goNext,
    goPrev,
    buildResponse,
  } = useQuestionState({ questions });
  if (!q) return null;

  const handleSubmit = (currentText?: string) => {
    const response = buildResponse(currentText);
    if (response) onSend(response);
  };

  return (
    <div className="px-4 pb-3">
      {/* Question header + pagination */}
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">
          {q.header}
        </span>
        {total > 1 && (
          <span className="text-[11px] text-muted-foreground">
            {page + 1}/{total}
          </span>
        )}
      </div>

      {/* Question text */}
      <p className="mb-2 text-sm text-foreground">{q.question}</p>

      {/* Option pills */}
      {q.options.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {q.options.map((opt: QuestionOption) => (
            <button
              key={opt.label}
              type="button"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                toggleOption(opt.label);
              }}
              disabled={sending}
              title={opt.description}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                currentSelected.has(opt.label)
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-surface-elevated",
                sending && "opacity-50",
              )}
            >
              {q.multiSelect ? (
                <span
                  className={cn(
                    "flex h-3 w-3 shrink-0 items-center justify-center rounded border",
                    currentSelected.has(opt.label)
                      ? "border-accent bg-accent"
                      : "border-muted-foreground",
                  )}
                >
                  {currentSelected.has(opt.label) && (
                    <svg
                      className="h-2 w-2 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      aria-hidden="true"
                    >
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
              ) : (
                <span
                  className={cn(
                    "flex h-3 w-3 shrink-0 items-center justify-center rounded-full border",
                    currentSelected.has(opt.label) ? "border-accent" : "border-muted-foreground",
                  )}
                >
                  {currentSelected.has(opt.label) && (
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  )}
                </span>
              )}
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Input + nav + actions */}
      <div className="flex items-end gap-2">
        <PendingRichTextInput
          value={currentCustom}
          resetKey={page}
          onChange={setCustomText}
          onSubmit={(text) => {
            if (hasAllAnswers) handleSubmit(text);
          }}
          placeholder="Other..."
          disabled={sending}
          submitLabel="Reply"
          SubmitIcon={Send}
          submitDisabled={!hasAllAnswers}
        />

        {total > 1 && (
          <div className="flex items-center gap-0.5 pb-0.5">
            <button
              type="button"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                goPrev();
              }}
              disabled={isFirstPage}
              className="rounded-md border border-border px-1.5 py-1.5 text-foreground disabled:opacity-50"
            >
              <ChevronLeft size={12} />
            </button>
            <button
              type="button"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                goNext();
              }}
              disabled={isLastPage}
              className="rounded-md border border-border px-1.5 py-1.5 text-foreground disabled:opacity-50"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={sending}
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onDismiss();
          }}
          className={cn(
            "flex items-center rounded-md border border-border px-1.5 py-1.5 text-xs transition-colors",
            "text-muted-foreground hover:bg-surface-elevated hover:text-red-400",
            sending && "opacity-50",
          )}
          title="Dismiss"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
