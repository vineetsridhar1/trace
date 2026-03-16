import { HelpCircle } from "lucide-react";
import type { Question } from "@trace/shared";
import { formatTime } from "./utils";

interface AskUserQuestionInlineProps {
  questions: Question[];
  timestamp: string;
}

export function AskUserQuestionInline({ questions, timestamp }: AskUserQuestionInlineProps) {
  return (
    <div className="accent-dashed-container px-4 py-3">
      <div className="mb-3 flex items-center gap-2">
        <HelpCircle size={16} className="text-accent" />
        <span className="text-sm font-medium text-accent">Question</span>
        <span className="ml-auto text-xs text-muted-foreground">{formatTime(timestamp)}</span>
      </div>

      <div className="space-y-3">
        {questions.map((q) => (
          <div key={q.header || q.question}>
            {q.header && (
              <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                {q.header}
              </div>
            )}
            <div className="mt-0.5 text-sm text-foreground">{q.question}</div>
            {q.options.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {q.options.map((opt) => (
                  <span
                    key={opt.label}
                    title={opt.description}
                    className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-foreground"
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
  );
}
