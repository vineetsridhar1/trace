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
      compact
      showMeta={false}
    />
  );
}
