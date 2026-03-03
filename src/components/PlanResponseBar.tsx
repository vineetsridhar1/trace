import { useState, useCallback, type KeyboardEvent } from 'react';
import { FiSend, FiX } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import type { AskUserQuestionNode, PlanReviewNode } from '../types';
import type { PlanResponseMode } from '../stores/claudeRunStore';
import { QuestionOptionPill } from './QuestionOptionPill';

const PLAN_PRESETS: { label: string; mode: PlanResponseMode }[] = [
  { label: 'Approve (clear context)', mode: 'clear-context' },
  { label: 'Approve (keep context)', mode: 'keep-context' },
];

export function PlanResponseBar({
  node,
  questionNode,
  onPlanResponse,
  onDismiss,
}: {
  node: PlanReviewNode;
  questionNode?: AskUserQuestionNode | null;
  onPlanResponse: (text: string, mode: PlanResponseMode) => void;
  onDismiss: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  // Question selection state (for inline question)
  const questions = questionNode?.questions ?? [];
  const [questionSelections, setQuestionSelections] = useState<Record<number, Set<string>>>({});
  const [questionCustomTexts, setQuestionCustomTexts] = useState<Record<number, string>>({});

  const toggleQuestionOption = useCallback(
    (qIndex: number, label: string, multiSelect: boolean) => {
      setQuestionSelections((prev) => {
        const current = prev[qIndex] ?? new Set<string>();
        const next = new Set(current);
        if (multiSelect) {
          if (next.has(label)) next.delete(label);
          else next.add(label);
        } else {
          if (next.has(label)) next.clear();
          else {
            next.clear();
            next.add(label);
          }
        }
        return { ...prev, [qIndex]: next };
      });
    },
    [],
  );

  const buildQuestionResponse = useCallback((): string | null => {
    if (questions.length === 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const sel = questionSelections[i];
      const custom = (questionCustomTexts[i] ?? '').trim();
      if (custom) {
        parts.push(`${q.header}: ${custom}`);
      } else if (sel && sel.size > 0) {
        parts.push(`${q.header}: ${[...sel].join(', ')}`);
      }
    }
    return parts.length > 0 ? parts.join('\n') : null;
  }, [questions, questionSelections, questionCustomTexts]);

  const handleSubmit = () => {
    const questionAnswer = buildQuestionResponse();
    if (selected) {
      const preset = PLAN_PRESETS.find((p) => p.label === selected);
      if (preset) {
        const text = questionAnswer
          ? `${preset.label}\n\nQuestion answers:\n${questionAnswer}`
          : preset.label;
        onPlanResponse(text, preset.mode);
      }
    } else if (feedback.trim()) {
      const text = questionAnswer
        ? `${feedback.trim()}\n\nQuestion answers:\n${questionAnswer}`
        : feedback.trim();
      onPlanResponse(text, 'revise');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (feedback.trim()) {
        setSelected(null);
        const questionAnswer = buildQuestionResponse();
        const text = questionAnswer
          ? `${feedback.trim()}\n\nQuestion answers:\n${questionAnswer}`
          : feedback.trim();
        onPlanResponse(text, 'revise');
      }
    }
  };

  const hasAnswer = selected !== null || feedback.trim().length > 0;

  return (
    <div className="border-t border-accent/30 bg-surface px-3 py-3">
      {/* Header row */}
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-light">
            Plan Review
          </span>
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

      {/* Inline question (when Claude asked a question + plan in the same turn) */}
      {questions.map((q, qIndex) => (
        <div key={qIndex} className="mb-2 rounded-md border border-accent/20 bg-accent/5 px-2.5 py-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-light">
              {q.header}
            </span>
          </div>
          <div className="mt-0.5 text-sm text-primary">{q.question}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {q.options.map((opt) => (
              <QuestionOptionPill
                key={opt.label}
                label={opt.label}
                description={opt.description}
                selected={(questionSelections[qIndex] ?? new Set()).has(opt.label)}
                multiSelect={q.multiSelect}
                onClick={() => toggleQuestionOption(qIndex, opt.label, q.multiSelect)}
              />
            ))}
          </div>
          <input
            type="text"
            value={questionCustomTexts[qIndex] ?? ''}
            onChange={(e) =>
              setQuestionCustomTexts((prev) => ({ ...prev, [qIndex]: e.target.value }))
            }
            placeholder="Other..."
            className="mt-1.5 w-full rounded-md border border-edge bg-surface-deep px-2.5 py-1 text-sm text-primary outline-none placeholder:text-muted focus:border-accent"
          />
        </div>
      ))}

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
          className="min-w-0 flex-1 rounded-md border border-edge bg-surface-deep px-2.5 py-1.5 text-sm text-primary outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="button"
          disabled={!hasAnswer}
          onClick={handleSubmit}
          className="flex items-center gap-1.5 cursor-pointer rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FiSend className="h-3.5 w-3.5" aria-hidden="true" />
          {selected ? 'Approve' : 'Revise'}
        </button>
      </div>
    </div>
  );
}
