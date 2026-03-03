import type { KeyboardEvent } from 'react';
import { FiChevronLeft, FiChevronRight, FiSend, FiX } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import type { AskUserQuestionNode } from '../types';
import { useQuestionState } from '../hooks/useQuestionState';
import { QuestionOptionPill } from './QuestionOptionPill';

/**
 * Compact bottom-bar replacement for the old AskUserQuestion bubble.
 * Renders in the input bar area with a violet border tint to signal question mode.
 */
export function AskUserQuestionBar({
  node,
  onResponse,
  onDismiss,
}: {
  node: AskUserQuestionNode;
  onResponse: (text: string) => void;
  onDismiss: () => void;
}) {
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (currentCustom.trim() && hasAllAnswers) {
        handleSubmit();
      }
    }
  };

  return (
    <div className="border-t border-accent/30 bg-surface px-3 py-3">
      {/* Header row: label, question text, X button */}
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-light">
              {question.header}
            </span>
            {total > 1 && (
              <span className="text-[11px] text-muted">
                {page + 1}/{total}
              </span>
            )}
          </div>
          <div className="mt-0.5 max-h-24 overflow-y-auto text-sm text-primary">
            {question.question}
          </div>
        </div>
        <Tooltip text="Dismiss">
          <button
            type="button"
            onClick={onDismiss}
            className="flex-shrink-0 cursor-pointer text-muted transition-colors hover:text-red-400"
          >
            <FiX className="h-4 w-4" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>

      {/* Option pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {question.options.map((opt) => (
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
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Other..."
          className="min-w-0 flex-1 rounded-md border border-edge bg-surface-deep px-2.5 py-1.5 text-sm text-primary outline-none placeholder:text-muted focus:border-accent"
        />

        {total > 1 && (
          <div className="flex items-center gap-1">
            <Tooltip text="Previous question">
              <button
                type="button"
                onClick={goPrev}
                disabled={isFirstPage}
                className="cursor-pointer rounded-md border border-edge px-2 py-1.5 text-xs text-primary transition-colors hover:border-edge-hover disabled:cursor-not-allowed disabled:opacity-30"
              >
                <FiChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip text="Next question">
              <button
                type="button"
                onClick={goNext}
                disabled={isLastPage}
                className="cursor-pointer rounded-md border border-edge px-2 py-1.5 text-xs text-primary transition-colors hover:border-edge-hover disabled:cursor-not-allowed disabled:opacity-30"
              >
                <FiChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        )}

        <Tooltip text="Send answers">
          <button
            type="button"
            disabled={!hasAllAnswers}
            onClick={handleSubmit}
            className="cursor-pointer rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FiSend className="h-4 w-4" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
