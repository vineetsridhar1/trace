import { describe, expect, it } from "vitest";
import { highlightCode } from "./code-highlight";

const kindOf = (source: string, text: string) =>
  highlightCode(source).find((token) => token.text === text)?.kind;

describe("highlightCode", () => {
  it("classifies keywords, types, strings and numbers", () => {
    const source = 'const games = new Map<string, State>("a", 42);';
    expect(kindOf(source, "const")).toBe("keyword");
    expect(kindOf(source, "string")).toBe("type");
    expect(kindOf(source, "State")).toBe("type");
    expect(kindOf(source, '"a"')).toBe("string");
    expect(kindOf(source, "42")).toBe("number");
  });

  it("treats a lowercase identifier before a paren as a call", () => {
    expect(kindOf("return getGame(id);", "getGame")).toBe("call");
    expect(kindOf("const id = value;", "value")).toBe("plain");
  });

  it("keeps a capitalized call as a type so constructors stay readable", () => {
    expect(kindOf("new NextResponse(body)", "NextResponse")).toBe("type");
  });

  it("captures comments and template strings whole", () => {
    expect(kindOf("// why this exists", "// why this exists")).toBe("comment");
    expect(kindOf("const a = `x${y}`;", "`x${y}`")).toBe("string");
  });

  it("preserves the exact source text in order", () => {
    const source = "  if (!game) return null;";
    expect(
      highlightCode(source)
        .map((token) => token.text)
        .join(""),
    ).toBe(source);
  });

  it("returns a single space for an empty line so the row keeps its height", () => {
    expect(highlightCode("")).toEqual([{ text: " ", kind: "plain" }]);
  });
});
