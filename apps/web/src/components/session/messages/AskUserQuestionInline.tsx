import { Check } from "lucide-react";
import type { Question } from "@trace/shared";
import { formatTime } from "./utils";

export function AskUserQuestionInline({
  questions,
  timestamp,
  replaced = false,
}: {
  questions: Question[];
  timestamp: string;
  replaced?: boolean;
}) {
  return (
    <div className="structured-question relative overflow-hidden rounded-[14px] border border-border bg-surface px-4 py-3 pl-5">
      <span
        className="absolute inset-y-0 left-0 w-[3px] bg-muted-foreground/40"
        aria-hidden="true"
      />
      <div className="flex items-center gap-2">
        <span className="grid h-4 w-4 place-items-center rounded-full border border-muted-foreground/50 text-muted-foreground">
          <Check size={10} />
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {replaced
            ? "Question replaced"
            : `${questions.length} question${questions.length === 1 ? "" : "s"} asked`}
        </span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {formatTime(timestamp)}
        </span>
      </div>
      <div className="mt-2.5 grid gap-2">
        {questions.map((question, index) => (
          <div
            key={question.id ?? `${index}-${question.question}`}
            className="flex items-baseline gap-2"
          >
            <span className="w-20 shrink-0 truncate font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {question.header || `Question ${index + 1}`}
            </span>
            <span className="line-clamp-2 text-xs leading-4 text-foreground">
              {question.question}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
