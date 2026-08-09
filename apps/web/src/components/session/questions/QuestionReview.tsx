import type { Question } from "@trace/shared";
import { questionAnswerLabel, type QuestionAnswer } from "./questionAnswerLabel";

export function QuestionReview({
  questions,
  answers,
  onEdit,
}: {
  questions: Question[];
  answers: QuestionAnswer[];
  onEdit: (index: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-semibold">Review the brief inputs</h3>
        <span className="ml-auto rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          editable
        </span>
      </div>
      <ul className="mt-2.5 grid gap-1.5">
        {questions.map((question, index) => (
          <li
            key={question.id ?? `${index}-${question.header}`}
            className="flex items-start gap-2 rounded-lg border border-border px-2.5 py-2"
          >
            <span className="grid min-w-0 gap-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                {question.header || `Question ${index + 1}`}
              </span>
              <span className="line-clamp-2 text-[11px] font-medium leading-4">
                {questionAnswerLabel(question, answers[index]!)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onEdit(index)}
              className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground hover:text-foreground"
            >
              edit
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
