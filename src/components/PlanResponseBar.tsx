import { useState, type KeyboardEvent } from 'react';
import { FiSend, FiX } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import type { PlanReviewNode } from '../types';
import type { PlanResponseMode } from '../stores/claudeRunStore';
import { QuestionOptionPill } from './QuestionOptionPill';

const PLAN_PRESETS: { label: string; mode: PlanResponseMode }[] = [
  { label: 'Approve (clear context)', mode: 'clear-context' },
  { label: 'Approve (keep context)', mode: 'keep-context' },
];

export function PlanResponseBar({
  node,
  onPlanResponse,
  onDismiss,
}: {
  node: PlanReviewNode;
  onPlanResponse: (text: string, mode: PlanResponseMode) => void;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  const handleSubmit = () => {
    if (selected) {
      const preset = PLAN_PRESETS.find((p) => p.label === selected);
      if (preset) {
        onPlanResponse(preset.label, preset.mode);
      }
    } else if (feedback.trim()) {
      onPlanResponse(feedback.trim(), 'revise');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (feedback.trim()) {
        setSelected(null);
        onPlanResponse(feedback.trim(), 'revise');
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

      {/* Approval pills */}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {PLAN_PRESETS.map((preset) => (
          <QuestionOptionPill
            key={preset.label}
            label={preset.label}
            description={preset.mode === 'clear-context' ? 'Start a new session with fresh context' : 'Continue with existing context'}
            selected={selected === preset.label}
            multiSelect={false}
            onClick={() => {
              setSelected(selected === preset.label ? null : preset.label);
              setFeedback('');
            }}
          />
        ))}
      </div>

      {/* Bottom row: revision input + send */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={feedback}
          onChange={(e) => {
            setFeedback(e.target.value);
            if (e.target.value) setSelected(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Suggest changes to revise the plan..."
          className="min-w-0 flex-1 rounded-md border border-[#292e42] bg-[#16161e] px-2.5 py-1.5 text-sm text-[#c0caf5] outline-none placeholder:text-[#565f89] focus:border-violet-500"
        />
        <button
          type="button"
          disabled={!hasAnswer}
          onClick={handleSubmit}
          className="flex items-center gap-1.5 cursor-pointer rounded-md bg-violet-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FiSend className="h-3.5 w-3.5" aria-hidden="true" />
          {selected ? 'Approve' : 'Revise'}
        </button>
      </div>
    </div>
  );
}
