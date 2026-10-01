export type CodeTokenKind =
  | "plain"
  | "punctuation"
  | "string"
  | "keyword"
  | "type"
  | "number"
  | "call"
  | "comment";

export interface CodeToken {
  text: string;
  kind: CodeTokenKind;
}

const KEYWORDS = new Set([
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "get",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "of",
  "private",
  "protected",
  "public",
  "readonly",
  "return",
  "satisfies",
  "set",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "yield",
]);

const PRIMITIVE_TYPES = new Set([
  "any",
  "bigint",
  "boolean",
  "never",
  "number",
  "object",
  "string",
  "symbol",
  "unknown",
]);

/** Mirrors the design's tokenizer: strings, keywords, types, numbers, call sites, then plain text. */
const TOKEN_PATTERN =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|([A-Za-z_$@][\w$]*)|(\d[\w.]*)|([^\s\w$@"'`]+|\s+)/g;

function identifierKind(word: string, nextChar: string): CodeTokenKind {
  if (KEYWORDS.has(word)) return "keyword";
  if (PRIMITIVE_TYPES.has(word)) return "type";
  if (/^[A-Z]/.test(word)) return "type";
  return nextChar === "(" || nextChar === "<" ? "call" : "plain";
}

export function highlightCode(source: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  for (const match of source.matchAll(TOKEN_PATTERN)) {
    const [text, comment, string, identifier, numeric] = match;
    if (comment) tokens.push({ text, kind: "comment" });
    else if (string) tokens.push({ text, kind: "string" });
    else if (identifier) {
      const nextChar = source[match.index + text.length] ?? "";
      tokens.push({ text, kind: identifierKind(identifier, nextChar) });
    } else if (numeric) tokens.push({ text, kind: "number" });
    else tokens.push({ text, kind: /\s/.test(text) ? "plain" : "punctuation" });
  }
  return tokens.length > 0 ? tokens : [{ text: " ", kind: "plain" }];
}

export const CODE_TOKEN_CLASS: Record<CodeTokenKind, string> = {
  plain: "text-[#d4d4d8]",
  punctuation: "text-[#9a9aa3]",
  string: "text-[#a9d9a4]",
  keyword: "text-[#c9a8f7]",
  type: "text-[#7cc4f0]",
  number: "text-[#f2b48a]",
  call: "text-[#e9cf9f]",
  comment: "text-[#6b7a99] italic",
};
