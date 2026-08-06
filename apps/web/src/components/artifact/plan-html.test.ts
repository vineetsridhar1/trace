import { describe, expect, it } from "vitest";
import { planMarkdownForImplementation, sandboxedPlanHtml } from "./plan-html";

describe("planMarkdownForImplementation", () => {
  it("converts semantic content to Markdown and drops presentation", () => {
    const result = planMarkdownForImplementation(
      `<!doctype html><html><head><style>.phase{color:red}</style></head>
       <body><!-- notes --><h1 class="plan-title">Add caching</h1>
       <div class="phase" data-step="1">Wire the store</div></body></html>`,
    );

    expect(result).toBe("# Add caching\n\nWire the store");
    expect(result).not.toContain("<h1");
    expect(result).not.toContain(".phase{color:red}");
    expect(result).not.toContain("notes");
  });

  it("preserves tables as compact GFM", () => {
    expect(
      planMarkdownForImplementation(
        "<table><thead><tr><th>Phase</th><th>File</th></tr></thead><tbody><tr><td>Build</td><td><code>app.ts</code></td></tr></tbody></table>",
      ),
    ).toContain("| Build | `app.ts` |");
  });

  it("converts fragments when there is no body", () => {
    expect(planMarkdownForImplementation("<h1>Plan</h1>")).toBe("# Plan");
  });
});

describe("sandboxedPlanHtml", () => {
  it("injects a network-denying CSP into an existing head", () => {
    const html = sandboxedPlanHtml(
      "<html><head><title>Plan</title></head><body>Body</body></html>",
    );
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'none'");
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("</head>"));
  });

  it("wraps fragments so the CSP remains in the document head", () => {
    const html = sandboxedPlanHtml("<main>Plan</main>");
    expect(html).toContain("<head><meta");
    expect(html).toContain("<body><main>Plan</main></body>");
  });
});
