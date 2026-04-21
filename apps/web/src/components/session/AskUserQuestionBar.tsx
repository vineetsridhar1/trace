import type { KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Send, X } from "lucide-react";
import { useQuestionState } from "@trace/client-core";
import type { Question, QuestionOption } from "@trace/shared";
import { QuestionOptionPill } from "./messages/QuestionOptionPill";

interface AskUserQuestionBarProps {
  node: {
    id: string;
    questions: Question[];
  };
  onResponse: (text: string) => void;
  onDismiss: () => void;
}

export function AskUserQuestionBar({ node, onResponse, onDismiss }: AskUserQuestionBarProps) {
  const {
    page,
    total,
    question,
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
  } = useQuestionState(node);

  const handleSubmit = () => {
    const response = buildResponse();
    if (response) onResponse(response);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (hasAllAnswers) {
        handleSubmit();
      }
    }
  };

  return (
    <div className="border-t border-accent/30 bg-surface px-3 py-3">
      {/* Header row */}
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">
              {question.header}
            </span>
            {total > 1 && (
              <span className="text-[11px] text-muted-foreground">
                {page + 1}/{total}
              </span>
            )}
          </div>
          <div className="mt-0.5 max-h-24 overflow-y-auto text-sm text-foreground">
            {question.question}
          </div>
        </div>
        <button
          type="button"
          title="Dismiss"
          onClick={onDismiss}
          className="flex-shrink-0 cursor-pointer text-muted-foreground hover:text-red-400"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Option pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {question.options.map((opt: QuestionOption) => (
          <QuestionOptionPill
            key={opt.label}
            label={opt.label}
            description={opt.description}
            selected={currentSelected.has(opt.label)}
            multiSelect={question.multiSelect}
            onClick={() => toggleOption(opt.label)}
          />
        ))}
      </div>

      {/* Bottom row: custom input, pagination, send */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={currentCustom}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Other..."
          className="min-w-0 flex-1 rounded-md border border-border bg-surface-deep px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-accent/50"
        />

        {total > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Previous question"
              onClick={goPrev}
              disabled={isFirstPage}
              className="cursor-pointer rounded-md border border-border px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              title="Next question"
              onClick={goNext}
              disabled={isLastPage}
              className="cursor-pointer rounded-md border border-border px-2 py-1.5 text-xs text-foreground disabled:opacity-50"
            >
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        <button
          type="button"
          title="Send answers"
          disabled={!hasAllAnswers}
          onClick={handleSubmit}
          className="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
