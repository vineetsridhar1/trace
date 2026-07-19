import { describe, expect, it } from "vitest";
import {
  readManualDesignElementStyles,
  updateManualDesignElementStyles,
} from "./design-manual-style.js";

describe("design manual element styles", () => {
  it("adds and reads a deterministic element override block", () => {
    const result = updateManualDesignElementStyles("/* Manual overrides. */\n", "hero-title", {
      color: "#112233",
      fontSize: 32,
      fontWeight: 600,
      textAlign: "center",
      paddingX: 12,
      paddingY: 8,
    });

    expect(result.source).toContain('[data-trace-id="hero-title"]');
    expect(result.source).toContain("padding-left: var(--trace-padding-x)");
    expect(readManualDesignElementStyles(result.source, "hero-title").styles).toEqual({
      color: "#112233",
      fontSize: 32,
      fontWeight: 600,
      textAlign: "center",
      paddingX: 12,
      paddingY: 8,
    });
  });

  it("replaces only the selected element block", () => {
    const first = updateManualDesignElementStyles("", "hero-title", { color: "#112233" });
    const second = updateManualDesignElementStyles(first.source, "hero-card", {
      backgroundColor: "#ffffff",
      borderRadius: 20,
    });
    const updated = updateManualDesignElementStyles(second.source, "hero-title", {
      color: "#445566",
    });

    expect(updated.source).toContain("color: #445566");
    expect(updated.source).toContain("background-color: #ffffff");
    expect(updated.source.match(/trace-manual:start hero-title/gu)).toHaveLength(1);
  });

  it("rejects unsupported values", () => {
    expect(() => updateManualDesignElementStyles("", "hero", { color: "red" })).toThrow(
      "six-digit hex",
    );
    expect(() => updateManualDesignElementStyles("", "hero", { fontSize: 200 })).toThrow(
      "between 8 and 96",
    );
    expect(() => updateManualDesignElementStyles("", "hero", { textAlign: "justify" })).toThrow(
      "left, center, or right",
    );
  });
});
