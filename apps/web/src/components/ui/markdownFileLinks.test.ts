import { describe, expect, it } from "vitest";

import { fileOpenRequestFromHref } from "./markdownFileLinks";

describe("fileOpenRequestFromHref", () => {
  it("parses absolute file links with line numbers", () => {
    expect(fileOpenRequestFromHref("/Users/me/project/src/index.tsx:59")).toEqual({
      filePath: "/Users/me/project/src/index.tsx",
      lineNumber: 59,
    });
  });

  it("parses relative file links with line numbers", () => {
    expect(fileOpenRequestFromHref("src/index.tsx:59")).toEqual({
      filePath: "src/index.tsx",
      lineNumber: 59,
    });
  });

  it("parses filename-only file links with line numbers", () => {
    expect(fileOpenRequestFromHref("index.tsx:59")).toEqual({
      filePath: "index.tsx",
      lineNumber: 59,
    });
  });

  it("normalizes dot-relative file links", () => {
    expect(fileOpenRequestFromHref("./index.tsx:59")).toEqual({
      filePath: "index.tsx",
      lineNumber: 59,
    });
  });

  it("rejects external URLs and anchors", () => {
    expect(fileOpenRequestFromHref("https://example.com/index.tsx:59")).toBeNull();
    expect(fileOpenRequestFromHref("mailto:user@example.com")).toBeNull();
    expect(fileOpenRequestFromHref("#section")).toBeNull();
  });
});
