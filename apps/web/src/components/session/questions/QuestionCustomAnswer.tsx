import type { Question } from "@trace/shared";
import { QuestionTextControl } from "./QuestionTextControl";

export function QuestionCustomAnswer({
  question,
  value,
  onChange,
  onContinue,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className="grid gap-1.5 border-t border-border pt-2">
      <span className="text-[11px] font-medium text-muted-foreground">Or write your own answer</span>
      <QuestionTextControl
        question={{
          ...question,
          maxLength: question.maxLength ?? 240,
          placeholder: question.placeholder ?? "Write your own answer…",
        }}
        value={value}
        onChange={onChange}
        onContinue={onContinue}
        autoFocus={false}
      />
    </div>
  );
}
