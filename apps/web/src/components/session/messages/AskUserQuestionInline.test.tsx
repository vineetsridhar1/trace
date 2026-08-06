import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Question } from "@trace/shared";
import { AskUserQuestionInline } from "./AskUserQuestionInline";

describe("AskUserQuestionInline", () => {
  it("renders questions once as a numbered list", () => {
    const questions: Question[] = [
      {
        id: "surface",
        header: "WHICH SURFACE SHOULD BE DESIGNED?",
        question: "Which surface should be designed?",
        options: [],
        multiSelect: false,
      },
      {
        id: "steps",
        header: "WHICH STEPS MUST THE FLOW INCLUDE?",
        question: "Which steps must the flow include?",
        options: [],
        multiSelect: false,
      },
    ];

    const markup = renderToStaticMarkup(
      <AskUserQuestionInline questions={questions} timestamp="2026-08-06T11:38:00Z" />,
    );

    expect(markup).toContain("2 questions asked");
    expect(markup).toContain("1.");
    expect(markup).toContain("2.");
    expect(markup).toContain("Which surface should be designed?");
    expect(markup).not.toContain("WHICH SURFACE SHOULD BE DESIGNED?");
  });
});
