import type { ReviewDiffSide } from "@trace/gql";
import { type DiffLine } from "./diff-patch";

export interface ReviewLineSelection {
  filePath: string;
  side: ReviewDiffSide;
  startLine: number;
  endLine: number;
  selectedText: string;
  context: string;
}

export interface LineRange {
  side: ReviewDiffSide;
  start: number;
  end: number;
}

export function lineSide(line: DiffLine): ReviewDiffSide {
  return line.kind === "delete" ? "base" : "head";
}

export function lineNumberForSide(line: DiffLine, side: ReviewDiffSide): number | null {
  return side === "base" ? line.oldLine : line.newLine;
}

export function rangeContains(range: LineRange | null, side: ReviewDiffSide, line: number | null) {
  return !!range && range.side === side && line != null && line >= range.start && line <= range.end;
}

export function selectionFromLines(
  filePath: string,
  lines: DiffLine[],
  range: LineRange,
): ReviewLineSelection | null {
  const indexes = lines.flatMap((line, index) =>
    rangeContains(range, lineSide(line), lineNumberForSide(line, range.side)) ? [index] : [],
  );
  if (indexes.length === 0) return null;
  const first = indexes[0]!;
  const last = indexes.at(-1)!;
  return {
    filePath,
    side: range.side,
    startLine: range.start,
    endLine: range.end,
    selectedText: indexes.map((index) => lines[index]!.text).join("\n"),
    context: lines
      .slice(Math.max(0, first - 3), Math.min(lines.length, last + 4))
      .map((line) => line.text)
      .join("\n"),
  };
}

export function selectionRangeLabel(range: LineRange): string {
  return range.end === range.start ? `L${range.start}` : `L${range.start}–${range.end}`;
}
