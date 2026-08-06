import type { Question } from "@trace/shared";
import { QuestionControl } from "./QuestionControl";

function typeLabel(question: Question): string {
  const type = question.type ?? (question.multiSelect ? "multi-select" : "single-select");
  if (type !== "multi-select" || (question.min == null && question.max == null)) return type;
  if (question.min != null && question.max != null)
    return `${type} · pick ${question.min}–${question.max}`;
  return question.min != null ? `${type} · min ${question.min}` : `${type} · max ${question.max}`;
}

export function QuestionTrayQuestion({
  question,
  selected,
  customText,
  ranking,
  validationMessage,
  onToggle,
  onTextChange,
  onMoveRank,
}: {
  question: Question;
  selected: ReadonlySet<string>;
  customText: string;
  ranking: readonly string[];
  validationMessage: string | null;
  onToggle: (value: string) => void;
  onTextChange: (value: string) => void;
  onMoveRank: (value: string, direction: -1 | 1) => void;
}) {
  return (
    <div className="mt-2 grid gap-2">
      <div className="flex items-center gap-2">
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          {typeLabel(question)}
        </span>
        {question.context ? (
          <span className="text-[11px] leading-4 text-muted-foreground">{question.context}</span>
        ) : null}
      </div>
      <h3 className="text-[15px] font-semibold leading-5">{question.question}</h3>
      <QuestionControl
        question={question}
        selected={selected}
        customText={customText}
        ranking={ranking}
        validationMessage={validationMessage}
        onToggle={onToggle}
        onTextChange={onTextChange}
        onMoveRank={onMoveRank}
      />
    </div>
  );
}
