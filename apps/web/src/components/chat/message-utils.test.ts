import { describe, expect, it } from "vitest";
import { editorTextToMessageText, hasMessageContent } from "./message-utils";

describe("editor message text", () => {
  it("preserves a single intentional line break while removing Quill's terminal newline", () => {
    const text = editorTextToMessageText("\n\n");

    expect(text).toBe("\n");
    expect(hasMessageContent(text)).toBe(true);
  });

  it("does not treat Quill's empty-document newline as message content", () => {
    const text = editorTextToMessageText("\n");

    expect(text).toBe("");
    expect(hasMessageContent(text)).toBe(false);
  });
});
