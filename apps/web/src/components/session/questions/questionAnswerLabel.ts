import type { Question } from "@trace/shared";

export interface QuestionAnswer {
  selected: ReadonlySet<string>;
  custom: string;
  ranking: readonly string[];
  assumed: boolean;
}

export function questionAnswerLabel(question: Question, answer: QuestionAnswer): string {
  if (answer.assumed) return "Agent decides";
  if (answer.custom) return answer.custom.replaceAll("\n", " · ");
  const labels = new Map(
    question.options.map((option) => [option.id ?? option.label, option.label]),
  );
  const values = question.type === "ranking" ? answer.ranking : [...answer.selected];
  return values.map((value) => labels.get(value) ?? value).join(" · ");
}
