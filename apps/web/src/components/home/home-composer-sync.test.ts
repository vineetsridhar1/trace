import { describe, expect, it } from "vitest";
import { externalPromptNeedsSync } from "./home-composer-sync";

describe("externalPromptNeedsSync", () => {
  it("does not rewrite editor-owned text containing trailing whitespace", () => {
    expect(externalPromptNeedsSync("Create ", "Create ")).toBe(false);
  });

  it("applies genuinely external draft changes", () => {
    expect(externalPromptNeedsSync("A restored draft", "Current editor text")).toBe(true);
  });
});
