import { describe, expect, it } from "vitest";
import { browserInitialNavigationUrl } from "./BrowserWorkspacePanel";

describe("browser initial navigation", () => {
  it("opens the requested page for a blank browser", () => {
    expect(browserInitialNavigationUrl("about:blank", "https://trace.example/")).toBe(
      "https://trace.example/",
    );
  });

  it("preserves a browser's restored page", () => {
    expect(browserInitialNavigationUrl("https://example.com/", "https://trace.example/")).toBeNull();
  });

  it("leaves a normal blank browser blank", () => {
    expect(browserInitialNavigationUrl("about:blank")).toBeNull();
  });
});
