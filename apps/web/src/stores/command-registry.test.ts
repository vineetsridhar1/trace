import { describe, expect, it } from "vitest";
import { formatShortcut, matchesShortcut, type CommandShortcut } from "./command-registry";

function keyEvent(init: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  code?: string;
}): KeyboardEvent {
  return {
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
  } as unknown as KeyboardEvent;
}

describe("matchesShortcut", () => {
  const cmdK: CommandShortcut = { key: "k", mod: true };

  it("matches the modifier key on both meta (Cmd) and ctrl", () => {
    expect(matchesShortcut(keyEvent({ key: "k", metaKey: true }), cmdK)).toBe(true);
    expect(matchesShortcut(keyEvent({ key: "k", ctrlKey: true }), cmdK)).toBe(true);
  });

  it("requires the modifier when the shortcut has mod", () => {
    expect(matchesShortcut(keyEvent({ key: "k" }), cmdK)).toBe(false);
  });

  it("is case-insensitive on the key", () => {
    expect(matchesShortcut(keyEvent({ key: "K", metaKey: true }), cmdK)).toBe(true);
  });

  it("distinguishes shift", () => {
    const cmdShiftE: CommandShortcut = { key: "e", mod: true, shift: true };
    expect(matchesShortcut(keyEvent({ key: "e", metaKey: true, shiftKey: true }), cmdShiftE)).toBe(
      true,
    );
    expect(matchesShortcut(keyEvent({ key: "e", metaKey: true }), cmdShiftE)).toBe(false);
    // A non-shift chord must not match when shift is held.
    expect(matchesShortcut(keyEvent({ key: "k", metaKey: true, shiftKey: true }), cmdK)).toBe(false);
  });

  it("distinguishes alt", () => {
    const altA: CommandShortcut = { key: "a", alt: true };
    expect(matchesShortcut(keyEvent({ key: "a", altKey: true }), altA)).toBe(true);
    expect(matchesShortcut(keyEvent({ key: "a" }), altA)).toBe(false);
  });

  it("supports Ctrl-only and physical-key shortcuts", () => {
    const ctrlTab: CommandShortcut = { key: "Tab", ctrl: true };
    const split: CommandShortcut = { key: "\\", code: "Backslash", mod: true };
    expect(matchesShortcut(keyEvent({ key: "Tab", ctrlKey: true }), ctrlTab)).toBe(true);
    expect(matchesShortcut(keyEvent({ key: "Tab", metaKey: true }), ctrlTab)).toBe(false);
    expect(matchesShortcut(keyEvent({ key: "§", code: "Backslash", metaKey: true }), split)).toBe(
      true,
    );
  });
});

describe("formatShortcut", () => {
  it("renders a modifier and the uppercased key", () => {
    const keys = formatShortcut({ key: "k", mod: true });
    expect(keys).toHaveLength(2);
    expect(["⌘", "Ctrl"]).toContain(keys[0]);
    expect(keys[1]).toBe("K");
  });

  it("includes shift and renders Enter as a glyph", () => {
    const keys = formatShortcut({ key: "Enter", mod: true, shift: true });
    expect(keys).toContain("⇧");
    expect(keys[keys.length - 1]).toBe("⏎");
  });
});
