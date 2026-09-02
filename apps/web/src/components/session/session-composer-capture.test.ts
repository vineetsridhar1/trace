import { describe, expect, it, vi } from "vitest";
import { pastedComposerText, shouldCaptureComposerKey } from "./session-composer-capture";

class EditableElement {
  tagName = "DIV";
  isContentEditable = true;
}

function keyEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key: "a",
    defaultPrevented: false,
    isComposing: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target: null,
    ...overrides,
  } as KeyboardEvent;
}

describe("session composer capture", () => {
  it("captures printable text only when no editor or shortcut owns the key", () => {
    expect(shouldCaptureComposerKey(keyEvent())).toBe(true);
    expect(shouldCaptureComposerKey(keyEvent({ key: "Enter" }))).toBe(false);
    expect(shouldCaptureComposerKey(keyEvent({ metaKey: true }))).toBe(false);
    expect(shouldCaptureComposerKey(keyEvent({ isComposing: true }))).toBe(false);
  });

  it("does not capture typing or pasting from an editable control", () => {
    vi.stubGlobal("HTMLElement", EditableElement);
    const target = new (HTMLElement as unknown as { new (): HTMLElement })();

    expect(shouldCaptureComposerKey(keyEvent({ target }))).toBe(false);
    expect(
      pastedComposerText({
        defaultPrevented: false,
        target,
        clipboardData: { getData: vi.fn(() => "pasted text") },
      } as unknown as ClipboardEvent),
    ).toBeNull();

    vi.unstubAllGlobals();
  });

  it("returns plain pasted text for an unfocused agent tab", () => {
    expect(
      pastedComposerText({
        defaultPrevented: false,
        target: null,
        clipboardData: { getData: vi.fn(() => "pasted text") },
      } as unknown as ClipboardEvent),
    ).toBe("pasted text");
  });
});
