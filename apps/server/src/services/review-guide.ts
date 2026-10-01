import { type Prisma } from "@prisma/client";
import { bundledTraceRuntimeFile } from "@trace/shared/trace-runtime";
import { ValidationError } from "../lib/errors.js";

export const REVIEW_GUIDE_SKILL_INSTRUCTION = [
  "Follow this Trace Review Guide methodology:",
  bundledTraceRuntimeFile("skills/review-guide/SKILL.md"),
].join("\n\n");

/** Inline prose anchor: `[[label|path|startLine-endLine]]`. */
const ANCHOR_PATTERN = /\[\[([^[\]|]+)\|([^[\]|]+)\|(\d+)-(\d+)\]\]/g;

interface GuideChapter {
  id: string;
  title: string;
  explanation: string;
  implications: string[];
  files: string[];
}

export interface ValidatedReviewGuide {
  title: string;
  intent: string;
  chapters: GuideChapter[];
  everythingElse: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function snapshotPaths(filesValue: Prisma.JsonValue): string[] {
  if (!Array.isArray(filesValue)) return [];
  return filesValue.flatMap((value) => {
    const file = asRecord(value);
    return typeof file?.path === "string" ? [file.path] : [];
  });
}

function stringList(value: unknown): string[] | null {
  if (typeof value === "string") return value.trim() ? [value.trim()] : null;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  const items = value.map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

/**
 * Inline anchors are what make Guide prose navigable, so they are held to the same standard as the
 * chapter's file coverage: an anchor may only point into a file the chapter owns, because the reader
 * jumps to it inside that chapter's own diff column.
 */
function validateAnchors(text: string, chapterFiles: Set<string>, label: string): void {
  for (const match of text.matchAll(ANCHOR_PATTERN)) {
    const [, , filePath, start, end] = match;
    if (!chapterFiles.has(filePath!)) {
      throw new ValidationError(
        `${label} links to ${filePath}, which is not one of that chapter's files`,
      );
    }
    if (Number(start) < 1 || Number(end) < Number(start)) {
      throw new ValidationError(`${label} links to an invalid line range in ${filePath}`);
    }
  }
}

export function guideGenerationInstruction(filesValue: Prisma.JsonValue): string {
  const paths = snapshotPaths(filesValue);
  return [
    "Return only JSON, with no Markdown fence or commentary.",
    'Use this exact shape: {"title":"...","intent":"...","chapters":[{"id":"...","title":"...","explanation":"...","implications":["..."],"files":["..."]}],"everythingElse":["..."]}.',
    `The authoritative changed-file paths are: ${JSON.stringify(paths)}.`,
    "Every authoritative path must occur exactly once across the entire response: either in the files of exactly one chapter or in everythingElse.",
    "Never repeat a path in another chapter or in everythingElse. Do not invent paths.",
    "Inside explanation and implications, link to specific code with [[label|path|startLine-endLine]]. The path must be one of that same chapter's files, startLine must be positive, and endLine must be at least startLine.",
  ].join("\n");
}

export function parseGuideResponse(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced?.[1] ?? trimmed) as unknown;
}

export function validateReviewGuide(
  value: unknown,
  filesValue: Prisma.JsonValue,
): ValidatedReviewGuide {
  const guide = asRecord(value);
  if (
    !guide ||
    typeof guide.title !== "string" ||
    typeof guide.intent !== "string" ||
    !Array.isArray(guide.chapters) ||
    !Array.isArray(guide.everythingElse)
  ) {
    throw new ValidationError("Guide response does not match the required structure");
  }

  const paths = snapshotPaths(filesValue);
  const allowedPaths = new Set(paths);
  const covered = new Set<string>();
  const chapters: GuideChapter[] = guide.chapters.map((chapterValue, chapterIndex) => {
    const chapter = asRecord(chapterValue);
    const implications = stringList(chapter?.implications);
    const files = stringList(chapter?.files);
    if (
      !chapter ||
      typeof chapter.id !== "string" ||
      typeof chapter.title !== "string" ||
      typeof chapter.explanation !== "string" ||
      !implications ||
      !files
    ) {
      throw new ValidationError(`Guide chapter ${chapterIndex + 1} is invalid`);
    }
    for (const filePath of files) {
      if (!allowedPaths.has(filePath)) {
        throw new ValidationError(`Guide references an unknown file: ${filePath}`);
      }
      if (covered.has(filePath)) {
        throw new ValidationError(`Guide repeats changed file: ${filePath}`);
      }
      covered.add(filePath);
    }
    const chapterFiles = new Set(files);
    const label = `Guide chapter "${chapter.title}"`;
    validateAnchors(chapter.explanation, chapterFiles, label);
    implications.forEach((implication) => validateAnchors(implication, chapterFiles, label));
    return {
      id: chapter.id,
      title: chapter.title,
      explanation: chapter.explanation,
      implications,
      files,
    };
  });

  const everythingElse = guide.everythingElse.map((value) => {
    if (typeof value !== "string" || !allowedPaths.has(value)) {
      throw new ValidationError("Guide contains an unknown file");
    }
    if (covered.has(value)) throw new ValidationError(`Guide repeats changed file: ${value}`);
    covered.add(value);
    return value;
  });
  const missing = paths.filter((path) => !covered.has(path));
  if (missing.length > 0) {
    throw new ValidationError(
      `Guide omits changed file${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
    );
  }

  return {
    title: guide.title,
    intent: guide.intent,
    chapters,
    everythingElse,
  };
}
