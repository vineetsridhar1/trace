import { describe, expect, it } from "vitest";
import { splitCopyBlocks } from "./copy-blocks";

describe("splitCopyBlocks", () => {
  it("returns no blocks for empty text", () => {
    expect(splitCopyBlocks(" \n\n\t ")).toEqual([]);
  });

  it("splits top-level markdown blocks on blank lines", () => {
    expect(splitCopyBlocks("First paragraph.\n\n- one\n- two\n\nFinal paragraph.")).toEqual([
      { id: "copy-block-0", text: "First paragraph." },
      { id: "copy-block-1", text: "- one\n- two" },
      { id: "copy-block-2", text: "Final paragraph." },
    ]);
  });

  it("keeps fenced code blocks intact", () => {
    expect(splitCopyBlocks("Before\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\nAfter")).toEqual([
      { id: "copy-block-0", text: "Before" },
      { id: "copy-block-1", text: "```ts\nconst a = 1;\n\nconst b = 2;\n```" },
      { id: "copy-block-2", text: "After" },
    ]);
  });

  it("normalizes CRLF line endings", () => {
    expect(splitCopyBlocks("One\r\n\r\nTwo")).toEqual([
      { id: "copy-block-0", text: "One" },
      { id: "copy-block-1", text: "Two" },
    ]);
  });
});
