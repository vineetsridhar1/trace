import { describe, expect, it } from "vitest";
import { composeTraceDesignPrompt } from "../src/design.js";

describe("composeTraceDesignPrompt", () => {
  it("includes the design artifact contract for initial variants", () => {
    const prompt = composeTraceDesignPrompt();

    expect(prompt).toContain("self-contained HTML document");
    expect(prompt).toContain(":root CSS variable token block");
    expect(prompt).toContain("stable data-el attributes");
    expect(prompt).toContain("origin-isolated user-content iframe");
    expect(prompt).toContain("distinct first design direction");
  });

  it("includes iteration and harness context when provided", () => {
    const prompt = composeTraceDesignPrompt({
      parentHtml: "<html><body>Previous</body></html>",
      designSystemId: "trace-core",
      skillIds: ["dashboard", "mobile"],
      selectedAnchors: [{ type: "element", dataEl: "hero-title" }],
    });

    expect(prompt).toContain("iterating on a previous artifact");
    expect(prompt).toContain("Design system id: trace-core");
    expect(prompt).toContain("Design skills: dashboard, mobile");
    expect(prompt).toContain('"dataEl":"hero-title"');
  });
});
