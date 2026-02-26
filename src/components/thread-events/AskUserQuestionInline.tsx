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
      <div className="rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs font-semibold text-violet-300">Question</span>
          <span className="text-xs text-[#565f89]">{time}</span>
        </div>

        <div className="space-y-3">
          {node.questions.map((q, i) => (
            <div key={i}>
              {q.header && (
                <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-400">
                  {q.header}
                </div>
              )}
              <div className="mt-0.5 text-sm text-[#c0caf5]">{q.question}</div>
              {q.options.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {q.options.map((opt) => (
                    <span
                      key={opt.label}
                      className="rounded-md border border-[#292e42] bg-[#1a1b26] px-2 py-0.5 text-xs text-[#a9b1d6]"
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
