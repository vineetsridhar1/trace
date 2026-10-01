export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
}

export interface DiffLine {
  kind: "add" | "delete" | "context" | "meta";
  text: string;
  oldLine: number | null;
  newLine: number | null;
  /** Set on `meta` rows only: the hunk the row introduces. */
  hunk?: DiffHunk;
  /** Set on `meta` rows only: unchanged lines collapsed before this hunk, if any. */
  gapLines?: number;
}

const HUNK_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let previousHunkEnd = 1;
  for (const text of patch.split("\n")) {
    const match = HUNK_PATTERN.exec(text);
    if (match) {
      const hunk: DiffHunk = {
        oldStart: Number(match[1]),
        oldCount: match[2] === undefined ? 1 : Number(match[2]),
        newStart: Number(match[3]),
        newCount: match[4] === undefined ? 1 : Number(match[4]),
      };
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      const gapLines = hunk.oldStart - previousHunkEnd;
      previousHunkEnd = hunk.oldStart + hunk.oldCount;
      lines.push({
        kind: "meta",
        text,
        oldLine: null,
        newLine: null,
        hunk,
        ...(gapLines > 0 ? { gapLines } : {}),
      });
      continue;
    }
    if (text.startsWith("+") && !text.startsWith("+++")) {
      lines.push({ kind: "add", text: text.slice(1), oldLine: null, newLine: newLine++ });
      continue;
    }
    if (text.startsWith("-") && !text.startsWith("---")) {
      lines.push({ kind: "delete", text: text.slice(1), oldLine: oldLine++, newLine: null });
      continue;
    }
    if (text.startsWith(" ")) {
      lines.push({ kind: "context", text: text.slice(1), oldLine: oldLine++, newLine: newLine++ });
    }
  }
  return lines;
}

/** Label for the collapsed-context row the design draws above each hunk. */
export function hunkGapLabel(line: DiffLine): string | null {
  if (line.kind !== "meta" || !line.hunk) return null;
  if (line.gapLines === undefined) return null;
  return `${line.gapLines} unchanged line${line.gapLines === 1 ? "" : "s"}`;
}

export function diffLineNumber(line: DiffLine): number | null {
  return line.newLine ?? line.oldLine;
}
