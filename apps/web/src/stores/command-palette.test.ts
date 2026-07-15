import { afterEach, describe, expect, it } from "vitest";
import { useCommandPaletteStore } from "./command-palette";

describe("generated project dialog state", () => {
  afterEach(() => {
    useCommandPaletteStore.getState().closeGeneratedProjectDialog();
  });

  it.each(["app", "design"] as const)("opens prompt-first creation for %s sessions", (kind) => {
    useCommandPaletteStore.getState().openGeneratedProjectDialog(kind);

    expect(useCommandPaletteStore.getState().newGeneratedProjectKind).toBe(kind);

    useCommandPaletteStore.getState().closeGeneratedProjectDialog();
    expect(useCommandPaletteStore.getState().newGeneratedProjectKind).toBeNull();
  });
});
