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

/** Accepts a single string or an array of them; returns null only when the shape is wrong. */
function stringList(value: unknown): string[] | null {
  if (value == null) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  return value.map((item) => item.trim()).filter(Boolean);
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

/** Keeps the prompt bounded on very large pull requests. */
const MAX_PROMPT_PATHS = 300;

export function guideGenerationInstruction(filesValue: Prisma.JsonValue): string {
  const paths = snapshotPaths(filesValue);
  const listed = paths.slice(0, MAX_PROMPT_PATHS);
  return [
    "Return only JSON, with no Markdown fence or commentary.",
    'Use this exact shape: {"title":"...","intent":"...","chapters":[{"id":"...","title":"...","explanation":"...","implications":["..."],"files":["..."]}],"everythingElse":["..."]}.',
    `The authoritative changed-file paths are: ${JSON.stringify(listed)}.`,
    ...(paths.length > listed.length
      ? [
          `That list is truncated to the first ${MAX_PROMPT_PATHS} of ${paths.length} paths; cover what you can and leave the rest out.`,
        ]
      : []),
    "Assign each path to the files of at most one chapter, or to everythingElse. Do not invent paths.",
    "Anything you do not assign is filed under everythingElse automatically, so prefer omitting a path over guessing at it.",
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
    const id = typeof chapter?.id === "string" ? chapter.id : null;
    const title = typeof chapter?.title === "string" ? chapter.title : null;
    const explanation = typeof chapter?.explanation === "string" ? chapter.explanation : null;
    const implications = stringList(chapter?.implications);
    const declaredFiles = stringList(chapter?.files);
    // Name the offending field: "chapter N is invalid" sent readers hunting through the whole
    // payload for one missing key.
    const badField = !id
      ? "id"
      : !title
        ? "title"
        : !explanation
          ? "explanation"
          : !implications
            ? "implications"
            : !declaredFiles || declaredFiles.length === 0
              ? "files"
              : null;
    if (badField || !id || !title || !explanation || !implications || !declaredFiles) {
      throw new ValidationError(
        `Guide chapter ${chapterIndex + 1} is missing or malformed "${badField ?? "files"}"`,
      );
    }
    // A path claimed by an earlier chapter is dropped rather than fatal: the chapter that claimed
    // it first still explains it, so discarding a whole generation over a repeat loses far more.
    const files: string[] = [];
    for (const filePath of declaredFiles) {
      if (!allowedPaths.has(filePath)) {
        throw new ValidationError(`Guide references an unknown file: ${filePath}`);
      }
      if (covered.has(filePath)) continue;
      covered.add(filePath);
      files.push(filePath);
    }
    const chapterFiles = new Set(declaredFiles);
    const label = `Guide chapter "${title}"`;
    validateAnchors(explanation, chapterFiles, label);
    implications.forEach((implication) => validateAnchors(implication, chapterFiles, label));
    return { id, title, explanation, implications, files };
  });

  const everythingElse = guide.everythingElse.flatMap((value): string[] => {
    if (typeof value !== "string" || !allowedPaths.has(value)) {
      throw new ValidationError(
        `Guide contains an unknown file: ${typeof value === "string" ? value : JSON.stringify(value)}`,
      );
    }
    if (covered.has(value)) return [];
    covered.add(value);
    return [value];
  });
  // Full coverage is a property of the stored Guide, not a demand on the model: anything the
  // chapters never claimed is filed under "everything else" instead of discarding the generation.
  everythingElse.push(...paths.filter((path) => !covered.has(path)));

  return {
    title: guide.title,
    intent: guide.intent,
    chapters,
    everythingElse,
  };
}
