import { useState, type KeyboardEvent } from 'react';
import type { PlanReviewNode } from '../types';
import { QuestionOptionPill } from './QuestionOptionPill';

const PLAN_PRESETS = [
  { label: 'Approve (clear context)', value: 'yes, and clear the context window when you start', clearContext: true },
  { label: 'Approve (keep context)', value: 'yes, and keep the context window as-is', clearContext: false },
  { label: 'Approve (manual review)', value: 'yes, but pause after each file so I can review', clearContext: false },
] as const;

/**
 * Compact bottom-bar for plan review responses.
 * Shows preset approval pills + custom feedback input, matching the AskUserQuestionBar style.
 */
export function PlanResponseBar({
  node,
  onPlanResponse,
  onDismiss,
}: {
  node: PlanReviewNode;
  onPlanResponse: (text: string, claudePrompt?: string) => void;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  const buildClaudePrompt = (instruction: string, clearContext?: boolean) => {
    if (!node.planContent) return undefined;
    if (clearContext) return node.planContent;
    return `${node.planContent}\n\n${instruction}`;
  };

  const handleSubmit = () => {
    if (selected) {
      const preset = PLAN_PRESETS.find((p) => p.label === selected);
      if (preset) {
        onPlanResponse(preset.value, buildClaudePrompt(preset.value, preset.clearContext));
      }
    } else if (feedback.trim()) {
      const claudePrompt = node.planContent
        ? `${node.planContent}\n\n${feedback.trim()}`
        : undefined;
      onPlanResponse(feedback.trim(), claudePrompt);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (feedback.trim()) {
        setSelected(null);
        const claudePrompt = node.planContent
          ? `${node.planContent}\n\n${feedback.trim()}`
          : undefined;
        onPlanResponse(feedback.trim(), claudePrompt);
      }
    }
  };

  const hasAnswer = selected !== null || feedback.trim().length > 0;

  return (
    <div className="border-t border-violet-500/30 bg-[#1a1b26] px-3 py-3">
      {/* Header row */}
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-violet-400">
            Plan Review
          </span>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          title="Dismiss and stop Claude"
          className="flex-shrink-0 cursor-pointer text-lg leading-none text-[#565f89] transition-colors hover:text-red-400"
        >
          &times;
        </button>
      </div>

      {/* Option pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PLAN_PRESETS.map((preset) => (
          <QuestionOptionPill
            key={preset.label}
            label={preset.label}
            description={preset.value}
            selected={selected === preset.label}
            multiSelect={false}
            onClick={() => {
              setSelected(selected === preset.label ? null : preset.label);
              setFeedback('');
            }}
          />
        ))}
      </div>

      {/* Bottom row: custom input + send */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={feedback}
          onChange={(e) => {
            setFeedback(e.target.value);
            if (e.target.value) setSelected(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Or type custom feedback..."
          className="min-w-0 flex-1 rounded-lg border border-[#292e42] bg-[#16161e] px-2.5 py-1.5 text-sm text-[#c0caf5] outline-none placeholder:text-[#565f89] focus:border-violet-500"
        />
        <button
          type="button"
          disabled={!hasAnswer}
          onClick={handleSubmit}
          title="Send"
          className="cursor-pointer rounded-lg bg-violet-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
