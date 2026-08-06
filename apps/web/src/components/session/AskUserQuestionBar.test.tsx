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
    context: `Context for ${id}`,
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
  it("renders one question inside the composer tray", () => {
    const markup = render([question("one")]);

    expect(markup).toContain("Answer before I continue");
    expect(markup).not.toContain("Question 1 of 1");
    expect(markup).not.toContain("trace:request-input");
    expect(markup).not.toContain("single-select");
    expect(markup).toContain('aria-label="Exit to chat"');
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain("fixed inset-0");
    expect(markup.indexOf("number keys pick")).toBeLessThan(markup.indexOf("You decide"));
    expect(markup.indexOf("You decide")).toBeLessThan(markup.indexOf(">Next<"));
  });

  it("starts a multi-question set as a progressive stack", () => {
    const markup = render([question("one"), question("two")]);

    expect(markup).toContain("Answer before I continue");
    expect(markup).toContain("question 1 of 2");
    expect(markup).toContain("Context for one");
    expect(markup).toContain(">Next<");
    expect(markup).not.toContain("Answer &amp; show question 2");
    expect(markup).not.toContain("sm:grid-cols-[212px_1fr]");
  });

  it("collapses to a waiting tray", () => {
    const markup = renderToStaticMarkup(
      <AskUserQuestionBar
        node={{ id: "question-node", questions: [question("one")] }}
        collapsed
        onResponse={() => undefined}
        onDismiss={() => undefined}
        onResume={() => undefined}
      />,
    );

    expect(markup).toContain("1 question waiting");
    expect(markup).toContain("tray collapsed");
    expect(markup).toContain("Resume");
  });
});
