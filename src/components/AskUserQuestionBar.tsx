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
    hasAnyAnswer,
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
      if (currentCustom.trim()) {
        handleSubmit();
      }
    }
  };

  return (
    <div className="border-t border-violet-500/30 bg-[#1a1b26] px-3 py-3">
      {/* Header row: label, question text, X button */}
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-400">
              {question.header}
            </span>
            {total > 1 && (
              <span className="text-[11px] text-[#565f89]">
                {page + 1}/{total}
              </span>
            )}
          </div>
          <div className="mt-0.5 max-h-24 overflow-y-auto text-sm text-[#c0caf5]">
            {question.question}
          </div>
        </div>
        <Tooltip text="Dismiss">
          <button
            type="button"
            onClick={onDismiss}
            className="flex-shrink-0 cursor-pointer text-[#565f89] transition-colors hover:text-red-400"
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
          className="min-w-0 flex-1 rounded-md border border-[#292e42] bg-[#16161e] px-2.5 py-1.5 text-sm text-[#c0caf5] outline-none placeholder:text-[#565f89] focus:border-violet-500"
        />

        {total > 1 && (
          <div className="flex items-center gap-1">
            <Tooltip text="Previous question">
              <button
                type="button"
                onClick={goPrev}
                disabled={isFirstPage}
                className="cursor-pointer rounded-md border border-[#292e42] px-2 py-1.5 text-xs text-[#a9b1d6] transition-colors hover:border-[#3b3f5c] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <FiChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
            <Tooltip text="Next question">
              <button
                type="button"
                onClick={goNext}
                disabled={isLastPage}
                className="cursor-pointer rounded-md border border-[#292e42] px-2 py-1.5 text-xs text-[#a9b1d6] transition-colors hover:border-[#3b3f5c] disabled:cursor-not-allowed disabled:opacity-30"
              >
                <FiChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
        )}

        <Tooltip text="Send answers">
          <button
            type="button"
            disabled={!hasAnyAnswer}
            onClick={handleSubmit}
            className="cursor-pointer rounded-md bg-violet-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FiSend className="h-4 w-4" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
