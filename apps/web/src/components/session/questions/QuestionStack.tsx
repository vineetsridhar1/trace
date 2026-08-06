import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { Question } from "@trace/shared";
import { cn } from "@/lib/utils";
import { questionAnswerLabel, type QuestionAnswer } from "./questionAnswerLabel";

export function QuestionStack({
  questions,
  answers,
  page,
  children,
  onEdit,
}: {
  questions: Question[];
  answers: QuestionAnswer[];
  page: number;
  children: ReactNode;
  onEdit: (index: number) => void;
}) {
  return (
    <div>
      {questions.slice(0, page).map((question, index) => (
        <div key={question.id ?? `${index}-${question.header}`}>
          <QuestionStep answered number={index + 1} question={question}>
            <div className="mt-1 flex items-start gap-2">
              <p className="text-xs font-semibold leading-4">
                {questionAnswerLabel(question, answers[index]!)}
              </p>
              <button
                type="button"
                onClick={() => onEdit(index)}
                className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
              >
                edit
              </button>
            </div>
          </QuestionStep>
          <span aria-hidden="true" className="ml-[11px] block h-3 w-px bg-border" />
        </div>
      ))}
      <QuestionStep number={page + 1} question={questions[page]!}>
        {children}
      </QuestionStep>
    </div>
  );
}

function QuestionStep({
  answered = false,
  number,
  question,
  children,
}: {
  answered?: boolean;
  number: number;
  question: Question;
  children: ReactNode;
}) {
  const showLabel = answered || (question.header && question.header !== question.question);
  return (
    <div className="grid grid-cols-[24px_1fr] gap-2.5">
      <span
        aria-hidden="true"
        className={cn(
          "relative z-10 grid h-6 w-6 place-items-center rounded-full border bg-surface-mid font-mono text-[10px]",
          answered
            ? "border-[color-mix(in_srgb,var(--th-success)_50%,transparent)] text-[var(--th-success)]"
            : "border-foreground/35 text-foreground",
        )}
      >
        {answered ? <Check size={11} strokeWidth={2.5} /> : number}
      </span>
      <div className="min-w-0 pt-0.5">
        {showLabel ? (
          <p
            className={cn(
              "text-xs leading-4",
              answered ? "text-muted-foreground" : "font-semibold",
            )}
          >
            {question.header || question.question}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
