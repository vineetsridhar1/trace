import { describe, expect, it } from "vitest";
import { isDesignSourcePath, parseDesignAttachments } from "./session.js";

describe("isDesignSourcePath", () => {
  it("keeps the design screen/component source and manifests", () => {
    expect(isDesignSourcePath("src/design/screens/WelcomeScreen.tsx")).toBe(true);
    expect(isDesignSourcePath("src/design/primitives/DesignButton.tsx")).toBe(true);
    expect(isDesignSourcePath("design.canvas.json")).toBe(true);
    expect(isDesignSourcePath("design.brief.json")).toBe(true);
    expect(isDesignSourcePath("trace.tokens.json")).toBe(true);
  });

  it("drops starter scaffolding that isn't part of the design artifact", () => {
    expect(isDesignSourcePath("package.json")).toBe(false);
    expect(isDesignSourcePath("vite.config.ts")).toBe(false);
    expect(isDesignSourcePath("src/main.tsx")).toBe(false);
    expect(isDesignSourcePath("src/App.tsx")).toBe(false);
  });
});

describe("parseDesignAttachments", () => {
  it("round-trips valid refs so they survive pending-command re-parsing", () => {
    const refs = [
      { designSessionGroupId: "grp-1", slug: "welcome-flow", designName: "Welcome flow" },
    ];
    expect(parseDesignAttachments(refs)).toEqual(refs);
  });

  it("ignores malformed entries and empty input", () => {
    expect(parseDesignAttachments(null)).toBeNull();
    expect(parseDesignAttachments([])).toBeNull();
    expect(parseDesignAttachments("nope")).toBeNull();
    expect(
      parseDesignAttachments([
        { designSessionGroupId: "grp-1" },
        { slug: "x", designName: "y" },
        42,
      ]),
    ).toBeNull();
  });

  it("keeps only the well-formed refs from a mixed list", () => {
    const good = { designSessionGroupId: "grp-2", slug: "checkout", designName: "Checkout" };
    expect(parseDesignAttachments([good, { designSessionGroupId: 1 }])).toEqual([good]);
  });
});
