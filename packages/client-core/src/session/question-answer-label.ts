import type { Question } from "@trace/shared";

export interface QuestionAnswerLabelInput {
  selected: ReadonlySet<string>;
  custom: string;
  ranking: readonly string[];
  references?: readonly string[];
  assumed: boolean;
}

export function questionAnswerLabel(question: Question, answer: QuestionAnswerLabelInput): string {
  if (answer.assumed) return "You decide";
  if (question.type === "reference") {
    return [answer.custom, ...(answer.references ?? [])].filter(Boolean).join(" · ");
  }
  if (answer.custom) return answer.custom.replaceAll("\n", " · ");

  const labels = new Map(
    question.options.map((option) => [option.id ?? option.label, option.label]),
  );
  const values = question.type === "ranking" ? answer.ranking : [...answer.selected];
  return values.map((value) => labels.get(value) ?? value).join(" · ");
}
