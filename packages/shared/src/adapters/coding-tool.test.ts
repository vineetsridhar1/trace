import { describe, expect, it } from "vitest";
import {
  hasQuestionBlock,
  parseTraceInputResponses,
  parseTraceRequestInputs,
} from "./coding-tool.js";

describe("parseTraceRequestInputs", () => {
  it("parses typed options and constraints", () => {
    const [question] = parseTraceRequestInputs(`
      <trace:request-input id="steps" type="multi-select" min="2" max="4">
        <context>Only selected steps will be designed.</context>
        <question>Which steps should be included?</question>
        <option id="company">Company details</option>
        <option id="bank" description="Connect an account">Bank connection</option>
      </trace:request-input>
    `);

    expect(question).toMatchObject({
      id: "steps",
      type: "multi-select",
      protocol: "trace",
      min: 2,
      max: 4,
      context: "Only selected steps will be designed.",
      question: "Which steps should be included?",
      options: [
        { id: "company", label: "Company details", description: "" },
        { id: "bank", label: "Bank connection", description: "Connect an account" },
      ],
    });
  });

  it("detects trace questions inside assistant text", () => {
    expect(
      hasQuestionBlock({
        type: "assistant",
        message: {
          content: [
            {
              type: "text",
              text: '<trace:request-input id="confirm" type="confirm"><question>Continue?</question></trace:request-input>',
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("ignores protocol examples inside fenced code", () => {
    expect(
      parseTraceRequestInputs(`\`\`\`xml
        <trace:request-input id="example" type="confirm">
          <question>Is this only an example?</question>
        </trace:request-input>
      \`\`\``),
    ).toEqual([]);
  });
});

describe("parseTraceInputResponses", () => {
  it("parses selections, text, and delegated answers", () => {
    expect(
      parseTraceInputResponses(`
      <trace:input-response id="surface"><selected>web</selected></trace:input-response>
      <trace:input-response id="promise"><text>Fast &amp; safe</text></trace:input-response>
      <trace:input-response id="reference"><assumption>you-decide</assumption></trace:input-response>
    `),
    ).toEqual([
      { id: "surface", selected: ["web"], text: undefined, assumed: false },
      { id: "promise", selected: [], text: "Fast & safe", assumed: false },
      { id: "reference", selected: [], text: undefined, assumed: true },
    ]);
  });
});
