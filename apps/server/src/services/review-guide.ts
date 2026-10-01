import type { ReviewGuideReference } from "@trace/gql";
import { validateExcerptRange } from "./review-excerpt.js";
import { type Prisma } from "@prisma/client";
import { bundledTraceRuntimeFile } from "@trace/shared/trace-runtime";
import { ValidationError } from "../lib/errors.js";

export const REVIEW_GUIDE_SKILL_INSTRUCTION = [
  "Follow this Trace Review Guide methodology:",
  bundledTraceRuntimeFile("skills/review-guide/SKILL.md"),
].join("\n\n");

/** Inline prose anchor: `[[label|path|startLine-endLine]]`. */
const ANCHOR_PATTERN = /\[\[([^|\r\n]+)\|([^|\r\n]+)\|(\d+)-(\d+)\]\]/g;
const MAX_PROMPT_PATHS = 500;

interface GuideChapter {
  id: string;
  title: string;
  explanation: string;
  implications: string[];
  files: string[];
  references: ReviewGuideReference[];
}

export interface ValidatedReviewGuide {
  formatVersion: number;
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

/** Exact paths win; only repair bracket escaping when there is one snapshot candidate. */
function pathResolver(paths: string[]): (path: string) => string {
  const exact = new Set(paths);
  const unescape = (path: string) => path.replace(/\\([[\]])/g, "$1");
  const aliases = new Map<string, string | null>();
  for (const path of paths) {
    const alias = unescape(path);
    aliases.set(alias, aliases.has(alias) ? null : path);
  }
  return (path) => (exact.has(path) ? path : (aliases.get(unescape(path)) ?? path));
}

/** Preserve repository references even when the snapshot has no diff for that file. */
function normalizeAnchors(text: string, resolvePath: (path: string) => string): string {
  return text.replace(ANCHOR_PATTERN, (_match, label: string, filePath: string, start, end) => {
    if (
      !Number.isSafeInteger(Number(start)) ||
      !Number.isSafeInteger(Number(end)) ||
      Number(start) < 1 ||
      Number(end) < Number(start)
    )
      return label;
    return `[[${label}|${resolvePath(filePath)}|${start}-${end}]]`;
  });
}

export function guideGenerationInstruction(
  filesValue: Prisma.JsonValue,
  instructions = "",
): string {
  const paths = snapshotPaths(filesValue);
  const listed = paths.slice(0, MAX_PROMPT_PATHS);
  return [
    ...(instructions.trim()
      ? [
          "Reviewer instructions control the Guide's scope, exclusions, and depth. Follow them instead of the default whole-PR overview. Keep the read-only constraints and JSON/reference contract.",
          "Omit excluded topics from chapters and excerpts. Unreferenced changed files may remain in everythingElse without explanation. For a deep dive, trace the requested behavior through its dependencies, state transitions, failure paths, and relevant tests. Include excluded areas only as a minimal dependency needed to explain the requested flow.",
          "Make the title and intent describe this focused walkthrough, not imply a complete review. If the requested topic is absent, explain that honestly using verified related code; do not invent references.",
          `Reviewer instructions: ${JSON.stringify(instructions.trim())}`,
        ]
      : []),
    "Return only JSON, with no Markdown fence or commentary.",
    'Use this exact shape: {"formatVersion":2,"title":"...","intent":"...","chapters":[{"id":"...","title":"...","explanation":"...","implications":["..."],"references":[{"filePath":"...","startLine":10,"endLine":20,"title":"...","explanation":"..."}]}],"everythingElse":["..."]}.',
    `The authoritative changed-file paths are: ${JSON.stringify(listed)}.`,
    ...(paths.length > listed.length
      ? [
          `That list is truncated to the first ${MAX_PROMPT_PATHS} of ${paths.length} paths; cover what you can and leave the rest out.`,
        ]
      : []),
    "Chapters explain behaviors, not files. Give each chapter ordered references tracing its code path, with a title and explanation for each step. The same file may appear in multiple chapters and steps. Include unchanged code when it helps explain the flow.",
    "Every reference needs its own explanation: identify what the important lines do (using Lx or Lx-Ly), why that matters to this chapter, and how the result connects to the preceding or following step. Bare L-ranges refer only to that step's file. For other files use [[label|path|startLine-endLine]] so readers can open the exact code in a popup. A title or filename alone is not an explanation.",
    "Every reference must name an exact head-commit range, typically 5-25 lines and at most 80. Do not use whole files as filler. Do not invent code, paths, or line numbers.",
    "Anything you do not assign is filed under everythingElse automatically, so prefer omitting a path over guessing at it.",
    "Inside explanation and implications, link to specific code with [[label|path|startLine-endLine]]. Each link should match a reference's exact range in this chapter. References may target any repository file, including files outside the PR or used in another chapter. Use exact paths (preserving literal brackets and backslashes) and head-commit line numbers. startLine must be positive, and endLine must be at least startLine.",
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
  options: { requireExplainedSteps?: boolean } = {},
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

  const explainedSteps = guide.formatVersion === 2 || options.requireExplainedSteps === true;
  const paths = snapshotPaths(filesValue);
  const resolvePath = pathResolver(paths);
  const covered = new Set<string>();
  const chapterIds = new Set<string>();

  // Coverage concerns changed files; contextual repository references remain valid.
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
    if (chapterIds.has(id)) throw new ValidationError(`Guide repeats chapter id "${id}"`);
    chapterIds.add(id);
    if (
      explainedSteps &&
      (!Array.isArray(chapter?.references) || chapter.references.length === 0)
    ) {
      throw new ValidationError(`Guide chapter "${title}" needs specific code references`);
    }
    const references: ReviewGuideReference[] = [];
    const addReference = (reference: ReviewGuideReference) => {
      if (
        !references.some(
          (existing) =>
            existing.filePath === reference.filePath &&
            existing.startLine === reference.startLine &&
            existing.endLine === reference.endLine,
        )
      )
        references.push(reference);
    };
    for (const value of Array.isArray(chapter?.references) ? chapter.references : []) {
      const ref = asRecord(value);
      if (
        typeof ref?.filePath !== "string" ||
        typeof ref.startLine !== "number" ||
        typeof ref.endLine !== "number"
      ) {
        throw new ValidationError(`Guide chapter "${title}" has a malformed code reference`);
      }
      const filePath = resolvePath(ref.filePath);
      validateExcerptRange(filePath, ref.startLine, ref.endLine);
      if (
        explainedSteps &&
        (typeof ref.title !== "string" ||
          !ref.title.trim() ||
          typeof ref.explanation !== "string" ||
          !ref.explanation.trim())
      ) {
        throw new ValidationError(`Guide reference in ${filePath} needs a title and explanation`);
      }
      addReference({
        filePath,
        startLine: ref.startLine,
        endLine: ref.endLine,
        title: typeof ref.title === "string" ? ref.title : filePath,
        explanation:
          typeof ref.explanation === "string" ? normalizeAnchors(ref.explanation, resolvePath) : "",
      });
    }
    // Older Guides expressed ranges only as prose links. Preserve these as focused excerpts,
    // but never fall back to rendering an entire file when a range is absent or too broad.
    if (!explainedSteps) {
      for (const text of [explanation, ...implications]) {
        for (const match of text.matchAll(ANCHOR_PATTERN)) {
          const filePath = resolvePath(match[2]!);
          const startLine = Number(match[3]);
          const endLine = Number(match[4]);
          try {
            validateExcerptRange(filePath, startLine, endLine);
          } catch {
            continue;
          }
          addReference({ filePath, startLine, endLine, title: match[1]!, explanation: "" });
        }
      }
    }
    const files = [
      ...new Set([
        ...(explainedSteps ? [] : declaredFiles.map(resolvePath)),
        ...references.map((reference) => reference.filePath),
      ]),
    ];
    files.forEach((filePath) => covered.add(filePath));
    return {
      id,
      title,
      explanation: normalizeAnchors(explanation, resolvePath),
      implications: implications.map((implication) => normalizeAnchors(implication, resolvePath)),
      files,
      references,
    };
  });

  const everythingElse = guide.everythingElse
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map(resolvePath)
    .filter((value) => {
      if (covered.has(value)) return false;
      covered.add(value);
      return true;
    });
  // Full coverage is a property of the stored Guide, not a demand on the model: anything the
  // chapters never claimed is filed under "everything else".
  everythingElse.push(...paths.filter((path) => !covered.has(path)));

  return {
    formatVersion: explainedSteps ? 2 : 1,
    title: guide.title,
    intent: guide.intent,
    chapters,
    everythingElse,
  };
}
