import { ValidationError } from "../lib/errors.js";

export const MAX_GUIDE_EXCERPT_LINES = 80;

export function validateExcerptRange(filePath: string, startLine: number, endLine: number): void {
  if (
    !filePath ||
    filePath.includes("\0") ||
    filePath.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new ValidationError("Guide reference requires a repository-relative file path");
  }
  if (
    !Number.isSafeInteger(startLine) ||
    !Number.isSafeInteger(endLine) ||
    startLine < 1 ||
    endLine < startLine
  ) {
    throw new ValidationError(`Guide reference has an invalid line range in ${filePath}`);
  }
  if (endLine - startLine + 1 > MAX_GUIDE_EXCERPT_LINES) {
    throw new ValidationError(
      `Guide reference in ${filePath} exceeds ${MAX_GUIDE_EXCERPT_LINES} lines; choose a focused range`,
    );
  }
}

export function sourceExcerpt(content: string, startLine: number, endLine: number): string {
  if (content.includes("\0") || Buffer.byteLength(content) > 2 * 1024 * 1024) {
    throw new ValidationError("Guide source is binary or too large to preview");
  }
  const lines = content.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (endLine > lines.length)
    throw new ValidationError("Guide range extends beyond the snapshot file");
  return lines.slice(startLine - 1, endLine).join("\n");
}
