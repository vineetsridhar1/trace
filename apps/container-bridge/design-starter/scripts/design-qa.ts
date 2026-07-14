import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { validateDesignManifest } from "../src/canvas/manifest";
import { validateDesignBrief } from "../src/design/brief";
import { validateDesignTokens } from "../src/design/tokens";

export type DesignQaReport = { errors: string[]; warnings: string[] };

const NETWORK_ASSET_PATTERN = /(?:src|href)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\//i;
const NETWORK_CODE_PATTERN =
  /\b(?:fetch|WebSocket|EventSource|XMLHttpRequest)\s*\(|\baxios(?:\.|\s*\()/;
const RAW_HEX_PATTERN = /#[\da-f]{3,8}\b/i;
const RAW_TAILWIND_COLOR_PATTERN =
  /\b(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function listTsxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return listTsxFiles(path);
      return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
    }),
  );
  return nested.flat();
}

export function auditScreenSource(
  source: string,
  fileName: string,
  requireDefaultExport = true,
): DesignQaReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (requireDefaultExport && !/export\s+default\s+/.test(source)) {
    errors.push(`${fileName} must have a default export`);
  }
  if (NETWORK_ASSET_PATTERN.test(source)) {
    errors.push(`${fileName} references a network asset; save it locally for offline export`);
  }
  if (NETWORK_CODE_PATTERN.test(source)) {
    errors.push(`${fileName} contains production network behavior outside the prototype boundary`);
  }
  if (RAW_HEX_PATTERN.test(source) || RAW_TAILWIND_COLOR_PATTERN.test(source)) {
    warnings.push(`${fileName} contains a raw color; prefer trace.tokens.json semantic utilities`);
  }
  return { errors, warnings };
}

export async function validateDesignProject(root: string): Promise<DesignQaReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const projectRoot = resolve(root);

  try {
    const [manifestValue, tokenValue, briefValue] = await Promise.all([
      readJson(join(projectRoot, "design.canvas.json")),
      readJson(join(projectRoot, "trace.tokens.json")),
      readJson(join(projectRoot, "design.brief.json")),
    ]);
    const manifest = validateDesignManifest(manifestValue);
    const tokens = validateDesignTokens(tokenValue);
    const brief = validateDesignBrief(briefValue);

    const requiredBriefFields = [
      ["artifactType", brief.artifactType],
      ["audience", brief.audience],
      ["platform", brief.platform],
      ["fidelity", brief.fidelity],
      ["primaryJob", brief.primaryJob],
      ["direction.name", brief.direction.name],
    ] as const;
    for (const [field, value] of requiredBriefFields) {
      if (value === null) errors.push(`design.brief.json must resolve ${field} before delivery`);
    }
    if (brief.coreFlow.length === 0) errors.push("design.brief.json coreFlow must not be empty");
    if (brief.direction.principles.length === 0) {
      errors.push("design.brief.json direction.principles must not be empty");
    }
    if (brief.direction.name !== tokens.direction.name) {
      errors.push("design.brief.json and trace.tokens.json must name the same visual direction");
    }

    const representedStates = new Set(
      manifest.screens.map((screen) => (screen.state ?? "default").trim().toLowerCase()),
    );
    for (const state of brief.requiredStates) {
      if (!representedStates.has(state.toLowerCase())) {
        errors.push(`Required state is missing from design.canvas.json: ${state}`);
      }
    }

    const screensDir = join(projectRoot, "src", "design", "screens");
    const declaredFiles = new Set(manifest.screens.map((screen) => basename(screen.component)));
    const actualFiles = (await readdir(screensDir)).filter((file) => file.endsWith(".tsx"));
    for (const file of declaredFiles) {
      if (!actualFiles.includes(file)) errors.push(`Missing declared screen component: ${file}`);
    }
    for (const file of actualFiles) {
      if (!declaredFiles.has(file))
        errors.push(`Screen component is not declared in the manifest: ${file}`);
      const source = await readFile(join(screensDir, file), "utf8");
      const report = auditScreenSource(source, file);
      errors.push(...report.errors);
      warnings.push(...report.warnings);
    }

    const designDir = join(projectRoot, "src", "design");
    const screenFilePaths = new Set(actualFiles.map((file) => join(screensDir, file)));
    const supportingFiles = (await listTsxFiles(designDir)).filter(
      (file) => !screenFilePaths.has(file),
    );
    for (const file of supportingFiles) {
      const fileName = relative(projectRoot, file);
      const report = auditScreenSource(await readFile(file, "utf8"), fileName, false);
      errors.push(...report.errors);
      warnings.push(...report.warnings);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Unable to validate design project");
  }

  return { errors, warnings };
}

export function formatDesignQaReport(report: DesignQaReport): string {
  const lines = [
    ...report.errors.map((error) => `ERROR ${error}`),
    ...report.warnings.map((warning) => `WARN  ${warning}`),
  ];
  lines.push(
    report.errors.length === 0
      ? `Design check passed${report.warnings.length ? ` with ${report.warnings.length} warning(s)` : ""}.`
      : `Design check failed with ${report.errors.length} error(s).`,
  );
  return lines.join("\n");
}
