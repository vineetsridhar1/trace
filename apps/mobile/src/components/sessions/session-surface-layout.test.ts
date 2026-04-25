import { describe, expect, it } from "vitest";
import { getSessionSurfaceComposerBottomPadding } from "./session-surface-layout";

describe("getSessionSurfaceComposerBottomPadding", () => {
  it("removes resting padding while the keyboard is visible", () => {
    expect(
      getSessionSurfaceComposerBottomPadding({
        keyboardVisible: true,
        tabBarHeight: 49,
        bottomInset: 0,
        spacingMd: 16,
        bridgeLocked: false,
      }),
    ).toBe(0);
  });

  it("keeps the locked banner above older-device safe areas", () => {
    expect(
      getSessionSurfaceComposerBottomPadding({
        keyboardVisible: false,
        tabBarHeight: 49,
        bottomInset: 20,
        spacingMd: 16,
        bridgeLocked: true,
      }),
    ).toBe(49);
    expect(
      getSessionSurfaceComposerBottomPadding({
        keyboardVisible: false,
        tabBarHeight: 32,
        bottomInset: 20,
        spacingMd: 16,
        bridgeLocked: true,
      }),
    ).toBe(36);
  });

  it("keeps the unlocked composer aligned with the tab bar", () => {
    expect(
      getSessionSurfaceComposerBottomPadding({
        keyboardVisible: false,
        tabBarHeight: 49,
        bottomInset: 20,
        spacingMd: 16,
        bridgeLocked: false,
      }),
    ).toBe(29);
  });
});
