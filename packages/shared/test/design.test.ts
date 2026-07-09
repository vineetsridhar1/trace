import { describe, expect, it } from "vitest";
import { composeTraceDesignPrompt } from "../src/design.js";

describe("composeTraceDesignPrompt", () => {
  it("includes the design artifact contract for initial variants", () => {
    const prompt = composeTraceDesignPrompt({
      kind: "design",
      userBrief: "Create a project dashboard.",
    });

    expect(prompt).toContain("Open Design System Prompt");
    expect(prompt).toContain("Create a project dashboard.");
    expect(prompt).toContain("self-contained HTML document");
    expect(prompt).toContain(":root CSS variable token block");
    expect(prompt).toContain("stable data-el attributes");
    expect(prompt).toContain("origin-isolated user-content iframe");
    expect(prompt).toContain("distinct first design direction");
  });

  it("includes iteration and harness context when provided", () => {
    const prompt = composeTraceDesignPrompt({
      kind: "design",
      userBrief: "Refine the hero.",
      artifactContext: "<html><body>Previous</body></html>",
      designSystemId: "trace-core",
      skillIds: ["dashboard", "mobile"],
      elementAnchors: [{ type: "element", dataEl: "hero-title" }],
    });

    expect(prompt).toContain("Previous");
    expect(prompt).toContain("Design System");
    expect(prompt).toContain("trace-core");
    expect(prompt).toContain("- dashboard");
    expect(prompt).toContain('"dataEl":"hero-title"');
  });

  it("composes an app-session prompt with starter and checkpoint expectations", () => {
    const prompt = composeTraceDesignPrompt({
      kind: "app",
      userBrief: "Build a lightweight CRM.",
      appStarterContext: "Next.js + Tailwind + shadcn, port 3000.",
      designSystemId: "trace-core",
      skillIds: ["forms"],
    });

    expect(prompt).toContain("full-stack product application");
    expect(prompt).toContain("Build a lightweight CRM.");
    expect(prompt).toContain("Next.js + Tailwind + shadcn");
    expect(prompt).toContain("data-trace-source");
    expect(prompt).toContain("managed remote lazily on the first checkpoint");
  });
});
