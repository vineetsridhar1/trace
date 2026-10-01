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
 * Inline anchors are navigation, not content. An anchor pointing outside the chapter's own files
 * cannot be followed — the reader jumps to it inside that chapter's diff column — so it is reduced
 * to its plain label rather than failing the whole Guide.
 */
function stripUnresolvableAnchors(text: string, chapterFiles: Set<string>): string {
  return text.replace(ANCHOR_PATTERN, (match, label: string, filePath: string, start, end) => {
    if (!chapterFiles.has(filePath)) return label;
    return Number(start) >= 1 && Number(end) >= Number(start) ? match : label;
  });
}

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

  // Only the Guide's structure is fatal. Every reference the model gets wrong — a path outside the
  // changeset, a repeat, an omission, an anchor that cannot be followed — is repaired here, because
  // the alternative is throwing away a generation that took a full coding-session turn. The agent
  // can read the whole repository, so naming a real file that this pull request does not touch is
  // its most likely mistake, not a sign the rest of the Guide is wrong.
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
            : !declaredFiles
              ? "files"
              : null;
    if (badField || !id || !title || !explanation || !implications || !declaredFiles) {
      throw new ValidationError(
        `Guide chapter ${chapterIndex + 1} is missing or malformed "${badField ?? "files"}"`,
      );
    }
    const files = declaredFiles.filter((filePath) => {
      if (!allowedPaths.has(filePath) || covered.has(filePath)) return false;
      covered.add(filePath);
      return true;
    });
    // Anchors are resolved against the files the chapter actually kept, so a stored Guide never
    // renders a link to a file this snapshot cannot show.
    const chapterFiles = new Set(files);
    return {
      id,
      title,
      explanation: stripUnresolvableAnchors(explanation, chapterFiles),
      implications: implications.map((implication) =>
        stripUnresolvableAnchors(implication, chapterFiles),
      ),
      files,
    };
  });

  const everythingElse = guide.everythingElse.filter((value): value is string => {
    if (typeof value !== "string" || !allowedPaths.has(value) || covered.has(value)) return false;
    covered.add(value);
    return true;
  });
  // Full coverage is a property of the stored Guide, not a demand on the model: anything the
  // chapters never claimed is filed under "everything else".
  everythingElse.push(...paths.filter((path) => !covered.has(path)));

  return {
    title: guide.title,
    intent: guide.intent,
    chapters,
    everythingElse,
  };
}
