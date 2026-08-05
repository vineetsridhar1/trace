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
    const markup = render([question("one")]);

    expect(markup).not.toContain("Before I continue");
    expect(markup).not.toContain("Question 1 of 1");
    expect(markup).toContain("flex flex-wrap justify-end gap-2");
    expect(markup.indexOf("number keys pick")).toBeLessThan(markup.indexOf("You decide"));
    expect(markup.indexOf("You decide")).toBeLessThan(markup.indexOf("Review 1 answer"));
  });

  it("shows the question-set sidebar for multiple questions", () => {
    const markup = render([question("one"), question("two")]);

    expect(markup).toContain("Before I continue");
    expect(markup).toContain("Question 1 of 2");
  });
});
