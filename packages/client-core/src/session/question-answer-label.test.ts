import { describe, expect, it } from "vitest";
import type { Question } from "@trace/shared";
import { questionAnswerLabel } from "./question-answer-label";

const baseQuestion: Question = {
  question: "Choose a direction",
  header: "Direction",
  options: [
    { id: "ship", label: "Ship now", description: "" },
    { id: "polish", label: "Polish first", description: "" },
  ],
  multiSelect: false,
};

describe("questionAnswerLabel", () => {
  it("uses option labels instead of protocol ids", () => {
    expect(
      questionAnswerLabel(baseQuestion, {
        selected: new Set(["ship"]),
        custom: "",
        ranking: [],
        assumed: false,
      }),
    ).toBe("Ship now");
  });

  it("summarizes reference text and attached filenames", () => {
    expect(
      questionAnswerLabel(
        { ...baseQuestion, type: "reference" },
        {
          selected: new Set(),
          custom: "https://trace.so/spec",
          ranking: [],
          references: ["wireframe.png"],
          assumed: false,
        },
      ),
    ).toBe("https://trace.so/spec · wireframe.png");
  });

  it("shows an explicit assumption before ranking defaults", () => {
    expect(
      questionAnswerLabel(
        { ...baseQuestion, type: "ranking" },
        {
          selected: new Set(),
          custom: "",
          ranking: ["ship", "polish"],
          assumed: true,
        },
      ),
    ).toBe("You decide");
  });
});
