import { describe, expect, it } from "vitest";
import { escapeHtml, planMarkupForImplementation } from "./plan-html";

describe("planMarkupForImplementation", () => {
  it("keeps the semantic markup and drops the presentation", () => {
    const result = planMarkupForImplementation(
      `<!doctype html><html><head><style>.phase{color:red}</style></head>
       <body><!-- notes --><h1 class="plan-title">Add caching</h1>
       <div class="phase" data-step="1">Wire the store</div></body></html>`,
    );

    expect(result).toContain('<h1 class="plan-title">Add caching</h1>');
    expect(result).toContain('class="phase"');
    expect(result).not.toContain(".phase{color:red}");
    expect(result).not.toContain("notes");
  });

  it("falls back to the whole document when there is no body", () => {
    expect(planMarkupForImplementation("<h1>Plan</h1>")).toBe("<h1>Plan</h1>");
  });
});

describe("escapeHtml", () => {
  it("neutralizes markup so legacy plans render as text", () => {
    expect(escapeHtml('# Plan <img src=x onerror="alert(1)">')).toBe(
      "# Plan &lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });
});
