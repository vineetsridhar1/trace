import {
  questionAnswerLabel as sharedQuestionAnswerLabel,
  type QuestionAnswerLabelInput,
} from "@trace/client-core";
import type { Question } from "@trace/shared";

export type QuestionAnswer = QuestionAnswerLabelInput;

export function questionAnswerLabel(question: Question, answer: QuestionAnswer): string {
  return sharedQuestionAnswerLabel(question, { ...answer, references: undefined });
}
