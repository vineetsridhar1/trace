import type { Question } from "@trace/shared";
import { QuestionTrayFrame } from "./QuestionTrayFrame";

export function QuestionCollapsedTray({
  questions,
  answeredCount,
  nextQuestion,
  onResume,
}: {
  questions: Question[];
  answeredCount: number;
  nextQuestion: string;
  onResume: () => void;
}) {
  const waiting = Math.max(0, questions.length - answeredCount);
  const ready = waiting === 0;
  return (
    <QuestionTrayFrame
      label={
        ready ? "Answers ready to send" : `${waiting} question${waiting === 1 ? "" : "s"} waiting`
      }
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
      </div>
    </QuestionTrayFrame>
  );
}
