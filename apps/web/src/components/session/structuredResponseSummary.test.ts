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
});
