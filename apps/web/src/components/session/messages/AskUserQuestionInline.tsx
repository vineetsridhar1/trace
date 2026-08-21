import { CircleHelp } from "lucide-react";
import type { Question } from "@trace/shared";
import { Markdown } from "../../ui/Markdown";
import { formatTime } from "./utils";

export function AskUserQuestionInline({
  questions,
  leadingText,
  timestamp,
  replaced = false,
}: {
  questions: Question[];
  leadingText?: string;
  timestamp: string;
  replaced?: boolean;
}) {
  return (
    <div className="grid gap-3">
      {leadingText ? (
        <div className="activity-row">
          <Markdown>{leadingText}</Markdown>
        </div>
      ) : null}
      <div className="structured-question relative overflow-hidden rounded-[14px] border border-border bg-surface px-4 py-3 pl-5">
        <span
          className="absolute inset-y-0 left-0 w-[3px] bg-muted-foreground/40"
          aria-hidden="true"
        />
        <div className="flex items-center gap-2">
          <CircleHelp size={15} className="text-muted-foreground" aria-hidden="true" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {replaced
              ? "Question replaced"
              : `${questions.length} question${questions.length === 1 ? "" : "s"} asked`}
          </span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            {formatTime(timestamp)}
          </span>
        </div>
        <ol className="mt-2.5 grid gap-2">
          {questions.map((question, index) => (
            <li
              key={question.id ?? `${index}-${question.question}`}
              className="grid grid-cols-[18px_1fr] items-start gap-2"
            >
              <span className="pt-px text-right font-mono text-[10px] leading-4 text-muted-foreground">
                {index + 1}.
              </span>
              <span className="text-xs leading-4 text-foreground">{question.question}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
