import { memo, useState, useCallback } from 'react';
import { FiSend } from 'react-icons/fi';
import type { AskUserQuestionNode } from '../../types';
import { formatTime } from '../../utils';

export interface AskUserQuestionActions {
  sendThreadMessage: (text: string) => Promise<unknown>;
}

export const AskUserQuestionInline = memo(function AskUserQuestionInline({
  node,
  actions,
}: {
  node: AskUserQuestionNode;
  actions?: AskUserQuestionActions;
}) {
  const time = formatTime(node.event.timestamp);
  const [freeText, setFreeText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleOptionClick = useCallback(
    async (label: string) => {
      if (!actions) return;
      setSubmitting(true);
      try {
        await actions.sendThreadMessage(label);
      } finally {
        setSubmitting(false);
      }
    },
    [actions],
  );

  const handleFreeTextSubmit = useCallback(async () => {
    if (!actions) return;
    const trimmed = freeText.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await actions.sendThreadMessage(trimmed);
      setFreeText('');
    } finally {
      setSubmitting(false);
    }
  }, [freeText, actions]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleFreeTextSubmit();
      }
    },
    [handleFreeTextSubmit],
  );

  const hasOptions = node.questions.some((q) => q.options.length > 0);

  return (
    <div className="px-4 py-2">
      <div className="rounded-lg border border-dashed border-accent/30 bg-accent/5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-accent-light">Question</span>
          <span className="text-xs text-muted">{time}</span>
        </div>

        <div className="space-y-3">
          {node.questions.map((q, i) => (
            <div key={i}>
              {q.header && (
                <div className="text-[11px] font-semibold uppercase tracking-wide text-accent-light">
                  {q.header}
                </div>
              )}
              <div className="mt-0.5 text-sm text-primary">{q.question}</div>
              {q.options.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {q.options.map((opt) =>
                    actions ? (
                      <button
                        key={opt.label}
                        type="button"
                        disabled={submitting}
                        onClick={() => handleOptionClick(opt.label)}
                        className="rounded-md border border-edge bg-surface px-2 py-0.5 text-xs text-primary transition-colors hover:border-accent/50 hover:bg-surface-elevated disabled:opacity-50"
                      >
                        {opt.label}
                      </button>
                    ) : (
                      <span
                        key={opt.label}
                        className="rounded-md border border-edge bg-surface px-2 py-0.5 text-xs text-primary"
                      >
                        {opt.label}
                      </span>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {actions && !hasOptions && (
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your answer..."
              disabled={submitting}
              className="flex-1 rounded-md border border-edge bg-surface px-2.5 py-1.5 text-sm text-primary placeholder:text-muted focus:border-accent/50 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleFreeTextSubmit}
              disabled={submitting || !freeText.trim()}
              className="btn-primary flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              <FiSend size={12} />
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
