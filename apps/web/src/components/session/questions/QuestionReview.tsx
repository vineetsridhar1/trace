import type { Question } from "@trace/shared";

interface AnswerState {
  selected: ReadonlySet<string>;
  custom: string;
  ranking: readonly string[];
  assumed: boolean;
}

function answerLabel(question: Question, answer: AnswerState): string {
  if (answer.assumed) return "You decide — record an assumption";
  if (answer.custom) return answer.custom.replaceAll("\n", " · ");
  const labels = new Map(
    question.options.map((option) => [option.id ?? option.label, option.label]),
  );
  const values = question.type === "ranking" ? answer.ranking : [...answer.selected];
  return values.map((value) => labels.get(value) ?? value).join(" · ");
}

export function QuestionReview({
  questions,
  answers,
  onEdit,
}: {
  questions: Question[];
  answers: AnswerState[];
  onEdit: (index: number) => void;
}) {
  return (
    <div>
      <h3 className="text-xl font-semibold leading-6 tracking-tight">
        Check these before I continue
      </h3>
      <p className="mt-1.5 text-xs leading-[18px] text-muted-foreground">
        Answers are returned as option IDs and remain visible in the transcript.
      </p>
      <ul className="mt-4 grid gap-1.5">
        {questions.map((question, index) => (
          <li
            key={question.id ?? `${index}-${question.header}`}
            className="flex items-start gap-3 rounded-lg border border-border bg-surface-deep/55 px-3 py-2.5"
          >
            <span className="grid min-w-0 gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {question.header || `Question ${index + 1}`}
              </span>
              <span className="line-clamp-2 text-[13px] font-medium leading-[18px]">
                {answerLabel(question, answers[index]!)}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onEdit(index)}
              className="ml-auto min-h-7 shrink-0 rounded-md border border-border px-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
            >
              edit
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
