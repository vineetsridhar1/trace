import { describe, expect, it } from "vitest";
import {
  createDesignSystemStaticPreview,
  designSystemStaticPreviewStorageKey,
} from "./design-system-static-preview.js";

function workbenchFiles() {
  return new Map<string, Buffer>([
    [
      "design-system/manifest.json",
      Buffer.from(JSON.stringify({ name: 'Acme "UI" <System>' })),
    ],
    [
      "design-system/preview/foundations.html",
      Buffer.from("<!doctype html><h1>Foundation &amp; tokens</h1>"),
    ],
    [
      "design-system/preview/components.html",
      Buffer.from('<!doctype html><button aria-label="Save">Save</button>'),
    ],
  ]);
}

describe("design-system static previews", () => {
  it("builds a self-contained, switchable canvas from the committed previews", () => {
    const html = createDesignSystemStaticPreview(workbenchFiles()).toString("utf8");

    expect(html).toContain("Foundations");
    expect(html).toContain("Components");
    expect(html).toContain("Foundation &amp;amp; tokens");
    expect(html).toContain("aria-label=&quot;Save&quot;");
    expect(html).toContain("Acme &quot;UI&quot; &lt;System&gt;");
  });

  it("uses an immutable commit-addressed storage key", () => {
    expect(designSystemStaticPreviewStorageKey("org-1", "system-1", "abc123")).toBe(
      "design-system-previews/org-1/system-1/abc123.html",
    );
  });

  it("rejects incomplete artifacts", () => {
    expect(() => createDesignSystemStaticPreview(new Map())).toThrow("static HTML previews");
  });
});
