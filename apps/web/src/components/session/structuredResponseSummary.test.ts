import { describe, expect, it } from "vitest";
import { structuredResponseSummary } from "./structuredResponseSummary";

describe("structuredResponseSummary", () => {
  it("renders structured responses as a friendly answer recap", () => {
    expect(
      structuredResponseSummary(`
        <trace:input-response id="target-platform">
          <selected>web-app</selected>
          <selected>mobile-app</selected>
        </trace:input-response>
        <trace:input-response id="brand-promise">
          <text>Fast &amp; safe</text>
        </trace:input-response>
        <trace:input-response id="references">
          <assumption>you-decide</assumption>
        </trace:input-response>
      `),
    ).toBe(`**My answers**

- **Target platform:** Web app, Mobile app
- **Brand promise:** Fast & safe
- **References:** You decide`);
  });

  it("leaves regular messages unchanged", () => {
    expect(structuredResponseSummary("Please make the header smaller.")).toBe(
      "Please make the header smaller.",
    );
  });

  it("leaves protocol documentation and mixed messages unchanged", () => {
    const example = `Here is the payload format:\n\n\`\`\`xml\n<trace:input-response id="example"><selected>web</selected></trace:input-response>\n\`\`\``;
    const mixed = `I added context before the answer.\n<trace:input-response id="target"><selected>web</selected></trace:input-response>`;

    expect(structuredResponseSummary(example)).toBe(example);
    expect(structuredResponseSummary(mixed)).toBe(mixed);
  });
});
