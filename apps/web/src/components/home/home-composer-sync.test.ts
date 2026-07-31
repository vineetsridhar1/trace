import { describe, expect, it } from "vitest";
import { HomeComposerTextSync } from "./home-composer-sync";

describe("HomeComposerTextSync", () => {
  it("preserves editor-owned trailing whitespace across controlled updates", () => {
    const sync = new HomeComposerTextSync("");

    sync.recordEditorText("Create");
    expect(sync.takeExternalText("Create")).toBeNull();

    sync.recordEditorText("Create ");
    expect(sync.takeExternalText("Create ")).toBeNull();

    sync.recordEditorText("Create something");
    expect(sync.takeExternalText("Create something")).toBeNull();
  });

  it("applies a genuinely external draft once without creating a feedback rewrite", () => {
    const sync = new HomeComposerTextSync("Current editor text");

    expect(sync.takeExternalText("A restored draft")).toBe("A restored draft");
    expect(sync.takeExternalText("A restored draft")).toBeNull();
  });
});
