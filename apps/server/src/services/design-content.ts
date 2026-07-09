import fs from "fs";
import path from "path";
import type { TraceDesignPromptContent } from "@trace/shared";

const CONTENT_DIRS_ENV = "TRACE_DESIGN_CONTENT_DIRS";
const MAX_TEXT_BYTES = 96 * 1024;

function contentRoots(): string[] {
  return (process.env[CONTENT_DIRS_ENV] ?? "")
    .split(path.delimiter)
    .map((root) => root.trim())
    .filter(Boolean);
}

function safeJoin(root: string, ...parts: string[]) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...parts);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`)
    ? resolved
    : null;
}

function readTextFile(filePath: string | null): string | null {
  if (!filePath) return null;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > MAX_TEXT_BYTES) return null;
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function readJsonObject(filePath: string | null): Record<string, unknown> | null {
  const raw = readTextFile(filePath);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringFromJson(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function findDesignSystemRoot(root: string, id: string) {
  const candidates = [
    safeJoin(root, "design-systems", id),
    safeJoin(root, "designSystems", id),
    safeJoin(root, id),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) ?? null;
}

function findSkillPath(root: string, id: string) {
  const candidates = [
    safeJoin(root, "skills", id, "SKILL.md"),
    safeJoin(root, "skills", `${id}.md`),
    safeJoin(root, id, "SKILL.md"),
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) ?? null;
}

export function loadTraceDesignPromptContent(input: {
  designSystemId?: string | null;
  skillIds?: string[] | null;
}): TraceDesignPromptContent {
  const roots = contentRoots();
  const content: TraceDesignPromptContent = {};

  if (input.designSystemId) {
    for (const root of roots) {
      const designSystemRoot = findDesignSystemRoot(root, input.designSystemId);
      if (!designSystemRoot) continue;
      const manifest = readJsonObject(safeJoin(designSystemRoot, "manifest.json"));
      content.designSystem = {
        id: input.designSystemId,
        name: stringFromJson(manifest?.name) ?? stringFromJson(manifest?.title),
        manifest,
        design: readTextFile(safeJoin(designSystemRoot, "DESIGN.md")),
        tokensCss: readTextFile(safeJoin(designSystemRoot, "tokens.css")),
        usage: readTextFile(safeJoin(designSystemRoot, "USAGE.md")),
        componentsManifest: readJsonObject(safeJoin(designSystemRoot, "components.manifest.json")),
      };
      break;
    }
  }

  const skills = [];
  for (const id of input.skillIds ?? []) {
    for (const root of roots) {
      const skillPath = findSkillPath(root, id);
      const body = readTextFile(skillPath);
      if (!body) continue;
      const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
      skills.push({ id, title, body });
      break;
    }
  }
  if (skills.length > 0) content.skills = skills;

  return content;
}
