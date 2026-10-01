import type { ReviewGuideReference } from "@trace/gql";

export interface GuideAnchor {
  filePath: string;
  startLine: number;
  endLine: number;
}

export type GuideSegment =
  | { kind: "text"; text: string }
  | { kind: "anchor"; label: string; anchor: GuideAnchor };

export interface GuideChapterContent {
  id: string;
  title: string;
  paragraphs: GuideSegment[][];
  implications: GuideSegment[][];
  files: string[];
  references: ReviewGuideReference[];
}

export interface GuideContent {
  chapters: GuideChapterContent[];
  everythingElse: string[];
}

/** Matches the `[[label|path|startLine-endLine]]` anchors the Guide contract puts inside prose. */
const ANCHOR_PATTERN = /\[\[([^[\]|]+)\|([^|\r\n]+)\|(\d+)-(\d+)\]\]/g;

export function parseGuideSegments(text: string): GuideSegment[] {
  const segments: GuideSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(ANCHOR_PATTERN)) {
    const index = match.index;
    if (index > cursor) segments.push({ kind: "text", text: text.slice(cursor, index) });
    segments.push({
      kind: "anchor",
      label: match[1]!,
      anchor: {
        filePath: match[2]!,
        startLine: Number(match[3]),
        endLine: Number(match[4]),
      },
    });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) });
  return segments;
}

export function guideAnchorLabel(anchor: GuideAnchor): string {
  return anchor.endLine === anchor.startLine
    ? `:${anchor.startLine}`
    : `:${anchor.startLine}–${anchor.endLine}`;
}

export function anchorsEqual(a: GuideAnchor | null, b: GuideAnchor): boolean {
  return !!a && a.filePath === b.filePath && a.startLine === b.startLine && a.endLine === b.endLine;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringList(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

/**
 * Guides are stored as validated JSON, so a Guide written before a contract change can still be the
 * latest one for an immutable snapshot. Derive the chapter's files from legacy `references` when the
 * newer `files` list is absent rather than rendering an empty chapter.
 */
function chapterFiles(chapter: Record<string, unknown>): string[] {
  const files = stringList(chapter.files);
  if (files.length > 0) return files;
  if (!Array.isArray(chapter.references)) return [];
  const derived: string[] = [];
  for (const value of chapter.references) {
    const path = asRecord(value)?.filePath;
    if (typeof path === "string" && !derived.includes(path)) derived.push(path);
  }
  return derived;
}

function chapterReferences(
  chapter: Record<string, unknown>,
  paragraphs: GuideSegment[][],
  implications: GuideSegment[][],
  legacy: boolean,
): ReviewGuideReference[] {
  const references: ReviewGuideReference[] = [];
  const add = (reference: ReviewGuideReference) => {
    if (
      !Number.isSafeInteger(reference.startLine) ||
      !Number.isSafeInteger(reference.endLine) ||
      reference.startLine < 1 ||
      reference.endLine < reference.startLine ||
      reference.endLine - reference.startLine >= 80
    )
      return;
    const existing = references.find((item) => anchorsEqual(item, reference));
    if (!existing) references.push(reference);
    else if (!existing.explanation.trim() && reference.explanation.trim())
      existing.explanation = reference.explanation;
  };
  for (const value of Array.isArray(chapter.references) ? chapter.references : []) {
    const reference = asRecord(value);
    if (
      typeof reference?.filePath !== "string" ||
      typeof reference.startLine !== "number" ||
      typeof reference.endLine !== "number"
    )
      continue;
    add({
      filePath: reference.filePath,
      startLine: reference.startLine,
      endLine: reference.endLine,
      title: typeof reference.title === "string" ? reference.title : reference.filePath,
      explanation: typeof reference.explanation === "string" ? reference.explanation : "",
    });
  }
  // Only legacy Guides infer snippets from prose. Reuse their actual surrounding paragraph,
  // rather than inventing an explanation or creating a title-only code card.
  for (const paragraph of [...paragraphs, ...implications]) {
    const explanation = paragraph
      .map((segment) =>
        segment.kind === "text"
          ? segment.text
          : `${segment.label} (L${segment.anchor.startLine}–${segment.anchor.endLine})`,
      )
      .join("");
    for (const segment of paragraph) {
      if (segment.kind !== "anchor") continue;
      if (legacy || references.some((reference) => anchorsEqual(reference, segment.anchor))) {
        add({ ...segment.anchor, title: segment.label, explanation });
      }
    }
  }
  return references;
}

export function guideReferenceKey(anchor: GuideAnchor): string {
  return JSON.stringify([anchor.filePath, anchor.startLine, anchor.endLine]);
}

export function normalizeGuideContent(value: unknown): GuideContent {
  const content = asRecord(value);
  const chapters = Array.isArray(content?.chapters) ? content.chapters : [];
  return {
    chapters: chapters.flatMap((chapterValue, index) => {
      const chapter = asRecord(chapterValue);
      if (!chapter || typeof chapter.title !== "string") return [];
      const explanation = typeof chapter.explanation === "string" ? chapter.explanation : "";
      const paragraphs = explanation
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map(parseGuideSegments);
      const implications = stringList(chapter.implications).map(parseGuideSegments);
      const references = chapterReferences(
        chapter,
        paragraphs,
        implications,
        content?.formatVersion !== 2,
      );
      return [
        {
          id: typeof chapter.id === "string" ? chapter.id : `chapter-${index + 1}`,
          title: chapter.title,
          paragraphs,
          implications,
          references,
          files: [
            ...new Set([
              ...chapterFiles(chapter),
              ...references.map((reference) => reference.filePath),
            ]),
          ],
        },
      ];
    }),
    everythingElse: stringList(content?.everythingElse),
  };
}
