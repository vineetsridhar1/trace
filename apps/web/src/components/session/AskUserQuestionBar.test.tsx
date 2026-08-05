import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Question } from "@trace/shared";
import { AskUserQuestionBar } from "./AskUserQuestionBar";

function question(id: string): Question {
  return {
    id,
    type: "single-select",
    protocol: "trace",
    header: `Question ${id}`,
    question: `Choose an answer for ${id}.`,
    multiSelect: false,
    options: [{ id: "yes", label: "Yes", description: "" }],
  };
}

function render(questions: Question[]): string {
  return renderToStaticMarkup(
    <AskUserQuestionBar
      node={{ id: "question-node", questions }}
      onResponse={() => undefined}
      onDismiss={() => undefined}
    />,
  );
}

describe("AskUserQuestionBar", () => {
  it("omits the question-set sidebar for one question", () => {
    expect(render([question("one")])).not.toContain("Before I continue");
  });

  it("shows the question-set sidebar for multiple questions", () => {
    expect(render([question("one"), question("two")])).toContain("Before I continue");
  });
});
