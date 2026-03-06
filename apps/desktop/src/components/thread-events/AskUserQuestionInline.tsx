import { memo } from 'react';
import type { AskUserQuestionNode } from '../../types';
import { formatTime } from '../../utils';

export const AskUserQuestionInline = memo(function AskUserQuestionInline({
  node,
}: {
  node: AskUserQuestionNode;
}) {
  const time = formatTime(node.event.timestamp);

  return (
    <div className="px-4 py-2">
      <div className="accent-dashed-container p-4">
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
                  {q.options.map((opt) => (
                    <span
                      key={opt.label}
                      className="rounded-md border border-edge bg-surface px-2 py-0.5 text-xs text-primary"
                    >
                      {opt.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
