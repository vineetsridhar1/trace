import { parseGuideSegments, type GuideSegment } from "./guide-content";

/** Structured links carry their own file; bare L-ranges refer to this snippet's file only. */
export function parseGuideExplanation(text: string, filePath: string): GuideSegment[] {
  return parseGuideSegments(text).flatMap((segment): GuideSegment[] => {
    if (segment.kind === "anchor") return [segment];
    const result: GuideSegment[] = [];
    let cursor = 0;
    const pattern =
      /([^\s`"'()<>|:]+\.[a-zA-Z0-9]+):L?(\d+)(?:[-–]L?(\d+))?\b|\bL(\d+)(?:\s*[-–]\s*L?(\d+))?\b/g;
    for (const match of segment.text.matchAll(pattern)) {
      const startLine = Number(match[2] ?? match[4]);
      const endLine = Number(match[3] ?? match[5] ?? startLine);
      if (
        !Number.isSafeInteger(startLine) ||
        !Number.isSafeInteger(endLine) ||
        startLine < 1 ||
        endLine < startLine ||
        endLine - startLine >= 80
      )
        continue;
      if (match.index > cursor)
        result.push({ kind: "text", text: segment.text.slice(cursor, match.index) });
      result.push({
        kind: "anchor",
        label: match[0],
        anchor: { filePath: match[1] ?? filePath, startLine, endLine },
      });
      cursor = match.index + match[0].length;
    }
    if (cursor < segment.text.length)
      result.push({ kind: "text", text: segment.text.slice(cursor) });
    return result;
  });
}
