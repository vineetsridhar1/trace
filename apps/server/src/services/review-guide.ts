import { type Prisma } from "@prisma/client";
import { ValidationError } from "../lib/errors.js";

interface GuideReference {
  filePath: string;
  startLine: number;
  endLine: number;
}

interface GuideChapter {
  id: string;
  title: string;
  explanation: string;
  implications: string[];
  references: GuideReference[];
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

function implications(value: unknown): string[] | null {
  if (typeof value === "string") return value.trim() ? [value.trim()] : null;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return null;
  const items = value.map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

export function guideGenerationInstruction(filesValue: Prisma.JsonValue): string {
  const paths = snapshotPaths(filesValue);
  return [
    "Return only JSON, with no Markdown fence or commentary.",
    'Use this exact shape: {"title":"...","intent":"...","chapters":[{"id":"...","title":"...","explanation":"...","implications":["..."],"references":[{"filePath":"...","startLine":1,"endLine":1}]}],"everythingElse":["..."]}.',
    `The authoritative changed-file paths are: ${JSON.stringify(paths)}.`,
    "Every authoritative path must occur exactly once across the entire response: either in the references of exactly one chapter or in everythingElse.",
    "Never repeat a path in another chapter or in everythingElse. Do not invent paths. Use positive line numbers and endLine >= startLine.",
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
    const chapterImplications = implications(chapter?.implications);
    if (
      !chapter ||
      typeof chapter.id !== "string" ||
      typeof chapter.title !== "string" ||
      typeof chapter.explanation !== "string" ||
      !chapterImplications ||
      !Array.isArray(chapter.references)
    ) {
      throw new ValidationError(`Guide chapter ${chapterIndex + 1} is invalid`);
    }
    const references: GuideReference[] = chapter.references.map((referenceValue) => {
      const reference = asRecord(referenceValue);
      if (
        !reference ||
        typeof reference.filePath !== "string" ||
        !allowedPaths.has(reference.filePath) ||
        !Number.isInteger(reference.startLine) ||
        !Number.isInteger(reference.endLine) ||
        Number(reference.startLine) < 1 ||
        Number(reference.endLine) < Number(reference.startLine)
      ) {
        throw new ValidationError("Guide contains an invalid snapshot reference");
      }
      if (covered.has(reference.filePath)) {
        throw new ValidationError(`Guide repeats changed file: ${reference.filePath}`);
      }
      covered.add(reference.filePath);
      return {
        filePath: reference.filePath,
        startLine: Number(reference.startLine),
        endLine: Number(reference.endLine),
      };
    });
    return {
      id: chapter.id,
      title: chapter.title,
      explanation: chapter.explanation,
      implications: chapterImplications,
      references,
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
