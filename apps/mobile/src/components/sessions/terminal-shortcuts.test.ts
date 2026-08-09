import { describe, expect, it } from "vitest";
import { TERMINAL_SHORTCUTS } from "./terminal-shortcuts";

describe("TERMINAL_SHORTCUTS", () => {
  it("exposes mobile equivalents for interrupt and shell history", () => {
    expect(TERMINAL_SHORTCUTS).toEqual(
      expect.arrayContaining([
        { label: "⌃C", data: "\u0003" },
        { label: "↑", data: "\u001b[A" },
        { label: "↓", data: "\u001b[B" },
      ]),
    );
  });
});
