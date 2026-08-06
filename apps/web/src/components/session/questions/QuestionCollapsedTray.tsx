import type { Question } from "@trace/shared";
import { QuestionTrayFrame } from "./QuestionTrayFrame";

export function QuestionCollapsedTray({
  questions,
  answeredCount,
  nextQuestion,
  onResume,
  onDecide,
}: {
  questions: Question[];
  answeredCount: number;
  nextQuestion: string;
  onResume: () => void;
  onDecide: () => void;
}) {
  const waiting = questions.length - answeredCount;
  return (
    <QuestionTrayFrame
      label={`${waiting} question${waiting === 1 ? "" : "s"} waiting`}
      meta="tray collapsed"
      compact
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-medium">{nextQuestion}</p>
        <button
          type="button"
          onClick={onResume}
          className="min-h-8 shrink-0 rounded-lg bg-foreground px-3 text-[11px] font-semibold text-background"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={onDecide}
          className="min-h-8 shrink-0 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          You decide
        </button>
      </div>
    </QuestionTrayFrame>
  );
}
