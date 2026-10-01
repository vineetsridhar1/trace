import type { ReviewProviderFile } from "./review-provider.js";

interface PatchLine {
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

const HUNK_PATTERN = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function patchLines(patch: string): PatchLine[] {
  const lines: PatchLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const raw of patch.split("\n")) {
    const hunk = HUNK_PATTERN.exec(raw);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[3]);
    } else if (raw.startsWith("+") && !raw.startsWith("+++")) {
      lines.push({ oldLine: null, newLine: newLine++, text: raw.slice(1) });
    } else if (raw.startsWith("-") && !raw.startsWith("---")) {
      lines.push({ oldLine: oldLine++, newLine: null, text: raw.slice(1) });
    } else if (raw.startsWith(" ")) {
      lines.push({ oldLine: oldLine++, newLine: newLine++, text: raw.slice(1) });
    }
  }
  return lines;
}

function exactMatches(
  file: ReviewProviderFile | undefined,
  side: "base" | "head",
  selectedLines: string[],
  source?: string,
): Array<{ startLine: number; endLine: number }> {
  const sourceLines = source?.split(/\r?\n/);
  if (sourceLines?.at(-1) === "") sourceLines.pop();
  const numbered = sourceLines
    ? sourceLines.map((text, index) => ({ number: index + 1, text }))
    : patchLines(file?.patch ?? "").flatMap((line) => {
        const number = side === "base" ? line.oldLine : line.newLine;
        return number == null ? [] : [{ number, text: line.text }];
      });
  const matches: Array<{ startLine: number; endLine: number }> = [];
  for (let index = 0; index <= numbered.length - selectedLines.length; index += 1) {
    const candidate = numbered.slice(index, index + selectedLines.length);
    const startLine = candidate[0]?.number;
    if (
      startLine != null &&
      candidate.every(
        (line, offset) => line.number === startLine + offset && line.text === selectedLines[offset],
      )
    ) {
      matches.push({ startLine, endLine: startLine + selectedLines.length - 1 });
    }
  }
  return matches;
}

export function reconcileReviewAnchor(
  anchor: Record<string, unknown>,
  scope: string,
  snapshotId: string,
  files: ReviewProviderFile[],
  source?: string | null,
): Record<string, unknown> {
  const filePath = typeof anchor.filePath === "string" ? anchor.filePath : null;
  const side = anchor.side === "base" || anchor.side === "head" ? anchor.side : null;
  const oldStart = typeof anchor.startLine === "number" ? anchor.startLine : null;
  const oldEnd = typeof anchor.endLine === "number" ? anchor.endLine : oldStart;
  const file = filePath
    ? files.find((candidate) => candidate.path === filePath || candidate.previousPath === filePath)
    : undefined;
  if (
    (!file && source === undefined) ||
    source === null ||
    !filePath ||
    !side ||
    oldStart == null ||
    oldEnd == null
  ) {
    return { ...anchor, snapshotId, status: "outdated" };
  }

  const path = file?.path ?? filePath;
  if (scope === "file") {
    return {
      ...anchor,
      snapshotId,
      filePath: path,
      status: path === filePath ? "current" : "relocated",
      originalLine: anchor.originalLine ?? oldStart,
      baseBlobId: file?.baseBlobId ?? null,
      headBlobId: file?.headBlobId ?? null,
    };
  }

  // An empty string is valid selected source for one blank line, not missing anchor data.
  const selectedLines =
    typeof anchor.selectedText === "string" ? anchor.selectedText.split("\n") : null;
  if (!selectedLines || selectedLines.length !== oldEnd - oldStart + 1) {
    return { ...anchor, snapshotId, filePath: path, status: "outdated" };
  }
  const matches = exactMatches(file, side, selectedLines, source);
  if (matches.length === 0) {
    return { ...anchor, snapshotId, filePath: path, status: "outdated" };
  }
  const match =
    matches.find((candidate) => candidate.startLine === oldStart) ??
    matches.sort(
      (left, right) => Math.abs(left.startLine - oldStart) - Math.abs(right.startLine - oldStart),
    )[0]!;
  const unchanged = path === filePath && match.startLine === oldStart && match.endLine === oldEnd;
  return {
    ...anchor,
    snapshotId,
    filePath: path,
    startLine: match.startLine,
    endLine: match.endLine,
    originalLine: anchor.originalLine ?? oldStart,
    status: unchanged ? "current" : "relocated",
    baseBlobId: file?.baseBlobId ?? null,
    headBlobId: file?.headBlobId ?? null,
  };
}
