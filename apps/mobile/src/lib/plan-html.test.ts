import { describe, expect, it } from "vitest";
import { isPlanNavigationAllowed, sandboxedPlanHtml } from "./plan-html";

describe("sandboxedPlanHtml", () => {
  it("adds a network-denying policy to an existing document head", () => {
    const html = sandboxedPlanHtml(
      "<html><head><title>Plan</title></head><body>Body</body></html>",
    );

    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("<title>Plan</title>");
  });

  it("creates a complete document for an HTML fragment", () => {
    expect(sandboxedPlanHtml("<main>Plan</main>")).toContain(
      '<html><head><meta http-equiv="Content-Security-Policy"',
    );
  });
});

describe("isPlanNavigationAllowed", () => {
  it("allows only the in-memory document", () => {
    expect(isPlanNavigationAllowed("about:blank")).toBe(true);
    expect(isPlanNavigationAllowed("https://example.com")).toBe(false);
  });
});
