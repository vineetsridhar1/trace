export const DESIGN_SYSTEM_SCHEMA_VERSION = "trace-design-system/v1" as const;

export const DESIGN_SYSTEM_LIMITS = {
  maxCompressedBytes: 25 * 1024 * 1024,
  maxUncompressedBytes: 75 * 1024 * 1024,
  maxFiles: 1_000,
  maxOrdinaryFileBytes: 5 * 1024 * 1024,
  maxAssetFileBytes: 20 * 1024 * 1024,
  maxPathLength: 240,
  maxPathDepth: 16,
} as const;

export type DesignSystemManifest = {
  schemaVersion: typeof DESIGN_SYSTEM_SCHEMA_VERSION;
  id: string;
  name: string;
  description: string;
  platforms: string[];
  files: {
    guidance: string;
    tokens: string;
    components: string;
    evidence: string;
  };
  componentsDirectory: string;
  assetsDirectory: string;
  previewDirectory: string;
};

export type DesignSystemValidation = {
  valid: boolean;
  errors: string[];
  manifest: DesignSystemManifest | null;
};

const REQUIRED_FILES = [
  "manifest.json",
  "DESIGN.md",
  "tokens.css",
  "components.manifest.json",
  "preview/foundations.html",
  "preview/components.html",
  "preview/foundations.png",
  "preview/components.png",
  "source/evidence.json",
] as const;

const REQUIRED_TOKEN_ROLES = [
  "--background",
  "--surface",
  "--foreground",
  "--muted-foreground",
  "--border",
  "--accent",
  "--accent-foreground",
  "--destructive",
  "--success",
  "--warning",
  "--font-sans",
  "--text-base",
  "--space-1",
  "--radius",
  "--shadow",
  "--focus-ring",
  "--motion-duration",
] as const;

const MANIFEST_KEYS = new Set([
  "schemaVersion",
  "id",
  "name",
  "description",
  "platforms",
  "files",
  "componentsDirectory",
  "assetsDirectory",
  "previewDirectory",
]);
const FILE_KEYS = new Set(["guidance", "tokens", "components", "evidence"]);
const SECRET_SEGMENTS =
  /(^|\/)(\.env(?:\..*)?|\.git|\.ssh|credentials?|secrets?|id_(?:rsa|ed25519))(\/|$)/i;

export function validateDesignSystemPath(value: string): string | null {
  if (!value || value.includes("\\") || value.includes("\0")) return "path is malformed";
  const segments = value.split("/");
  const normalized = segments.join("/");
  if (
    normalized !== value ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return "path must be normalized and package-relative";
  }
  if (normalized.length > DESIGN_SYSTEM_LIMITS.maxPathLength) return "path is too long";
  if (normalized.split("/").length > DESIGN_SYSTEM_LIMITS.maxPathDepth) return "path is too deep";
  if (SECRET_SEGMENTS.test(normalized)) return "secret-like paths are forbidden";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseJson(text: string, label: string, errors: string[]): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    errors.push(`${label} is not valid JSON`);
    return null;
  }
}

function parseManifest(text: string, errors: string[]): DesignSystemManifest | null {
  const value = parseJson(text, "manifest.json", errors);
  if (!isRecord(value)) return null;
  for (const key of Object.keys(value)) {
    if (!MANIFEST_KEYS.has(key)) errors.push(`manifest.json has unknown field: ${key}`);
  }
  if (value.schemaVersion !== DESIGN_SYSTEM_SCHEMA_VERSION)
    errors.push("unsupported schemaVersion");
  for (const key of ["id", "name", "description"] as const) {
    if (typeof value[key] !== "string" || !value[key].trim()) errors.push(`${key} is required`);
  }
  if (!Array.isArray(value.platforms) || value.platforms.some((item) => typeof item !== "string")) {
    errors.push("platforms must be an array of strings");
  }
  if (!isRecord(value.files)) {
    errors.push("files is required");
  } else {
    for (const key of Object.keys(value.files)) {
      if (!FILE_KEYS.has(key)) errors.push(`manifest files has unknown field: ${key}`);
    }
    for (const key of FILE_KEYS) {
      const file = value.files[key];
      if (typeof file !== "string") errors.push(`files.${key} is required`);
      else {
        const pathError = validateDesignSystemPath(file);
        if (pathError) errors.push(`files.${key}: ${pathError}`);
      }
    }
  }
  for (const key of ["componentsDirectory", "assetsDirectory", "previewDirectory"] as const) {
    const directory = value[key];
    if (typeof directory !== "string") errors.push(`${key} is required`);
    else {
      const pathError = validateDesignSystemPath(directory);
      if (pathError) errors.push(`${key}: ${pathError}`);
    }
  }
  return errors.length === 0 ? (value as DesignSystemManifest) : null;
}

function validateTokens(css: string, errors: string[]): void {
  if (!/:root\s*\{[\s\S]*\}/.test(css)) errors.push("tokens.css must contain a :root block");
  if ((css.match(/\{/g)?.length ?? 0) !== (css.match(/\}/g)?.length ?? 0)) {
    errors.push("tokens.css has unbalanced blocks");
  }
  const declarations = new Map<string, string>();
  for (const block of css.matchAll(/[^{}]+\{([^{}]*)\}/g)) {
    const blockDeclarations = new Set<string>();
    for (const match of block[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+);/gi)) {
      if (blockDeclarations.has(match[1])) errors.push(`duplicate token in rule: ${match[1]}`);
      blockDeclarations.add(match[1]);
      if (!declarations.has(match[1])) declarations.set(match[1], match[2].trim());
    }
  }
  for (const role of REQUIRED_TOKEN_ROLES) {
    if (!declarations.has(role)) errors.push(`missing required token: ${role}`);
  }
  for (const [name, value] of declarations) {
    for (const alias of value.matchAll(/var\((--[a-z0-9-]+)/gi)) {
      if (!declarations.has(alias[1]))
        errors.push(`unresolved token alias in ${name}: ${alias[1]}`);
    }
  }
  const parseHex = (value: string | undefined): [number, number, number] | null => {
    const match = value?.trim().match(/^#([a-f0-9]{6})$/i);
    if (!match) return null;
    return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16)) as [
      number,
      number,
      number,
    ];
  };
  const luminance = (rgb: [number, number, number]) =>
    rgb
      .map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  for (const [foreground, background] of [
    ["--foreground", "--background"],
    ["--accent-foreground", "--accent"],
  ] as const) {
    const fg = parseHex(declarations.get(foreground));
    const bg = parseHex(declarations.get(background));
    if (fg && bg) {
      const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      if ((values[0] + 0.05) / (values[1] + 0.05) < 4.5)
        errors.push(`insufficient contrast: ${foreground} on ${background}`);
    }
  }
}

function validateComponents(
  text: string,
  files: ReadonlyMap<string, Buffer>,
  errors: string[],
): void {
  const value = parseJson(text, "components.manifest.json", errors);
  if (!isRecord(value) || !Array.isArray(value.components)) {
    errors.push("components.manifest.json must contain a components array");
    return;
  }
  for (const [index, raw] of value.components.entries()) {
    if (!isRecord(raw)) {
      errors.push(`component ${index} is invalid`);
      continue;
    }
    if (typeof raw.name !== "string" || !raw.name) errors.push(`component ${index} needs a name`);
    if (
      (typeof raw.category !== "string" || !raw.category) &&
      (typeof raw.classification !== "string" || !raw.classification)
    )
      errors.push(`component ${index} needs a category`);
    for (const field of [
      "sourcePaths",
      "exportNames",
      "variants",
      "sizes",
      "states",
      "tokenDependencies",
      "assetDependencies",
      "limitations",
    ] as const) {
      const value = field === "sourcePaths" ? (raw[field] ?? raw.source) : raw[field];
      if (
        value !== undefined &&
        (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
      )
        errors.push(`component ${index} needs string array ${field}`);
    }
    for (const field of ["accessibility", "interaction", "confidence"] as const) {
      if (raw[field] !== undefined && typeof raw[field] !== "string")
        errors.push(`component ${index} needs ${field}`);
    }
    if (!new Set(["portable", "recipe", "reference"]).has(String(raw.reuseMode))) {
      errors.push(`component ${index} has invalid reuseMode`);
    }
    if (raw.reuseMode === "portable") {
      const entry = raw.entry ?? raw.portablePath;
      if (typeof entry !== "string" || !entry.startsWith("components/")) {
        errors.push(`portable component ${String(raw.name)} needs an internal entry`);
      } else if (!files.has(entry)) {
        errors.push(`portable component entry is missing: ${entry}`);
      } else {
        const source = files.get(entry)?.toString("utf8") ?? "";
        const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
        const unsupported = imports.some(
          (specifier) =>
            !specifier.startsWith("./") &&
            ![
              "react",
              "react/jsx-runtime",
              "clsx",
              "class-variance-authority",
              "tailwind-merge",
            ].includes(specifier),
        );
        const entryDirectory = entry.split("/").slice(0, -1);
        const missingRelativeImport = imports
          .filter((specifier) => specifier.startsWith("./"))
          .some((specifier) => {
            const parts = [...entryDirectory, ...specifier.split("/")];
            const resolved: string[] = [];
            for (const part of parts)
              part === "." ? undefined : part === ".." ? resolved.pop() : resolved.push(part);
            const candidate = resolved.join("/");
            return ![
              candidate,
              `${candidate}.ts`,
              `${candidate}.tsx`,
              `${candidate}.js`,
              `${candidate}.jsx`,
              `${candidate}/index.ts`,
              `${candidate}/index.tsx`,
            ].some((path) => files.has(path));
          });
        if (
          unsupported ||
          missingRelativeImport ||
          /from\s+["'](?:node:|https?:|\/|\.\.\/)/.test(source) ||
          /\b(?:fetch|XMLHttpRequest|WebSocket)\b/.test(source)
        ) {
          errors.push(
            `portable component ${String(raw.name)} has an unsafe import or network call`,
          );
        }
        if (Array.isArray(raw.assetDependencies)) {
          for (const asset of raw.assetDependencies) {
            if (typeof asset !== "string" || !files.has(asset))
              errors.push(
                `portable component ${String(raw.name)} has an undeclared or missing asset`,
              );
          }
        }
      }
    }
  }
}

export function validateDesignSystemPackage(
  files: ReadonlyMap<string, Buffer>,
): DesignSystemValidation {
  const errors: string[] = [];
  if (files.size > DESIGN_SYSTEM_LIMITS.maxFiles) errors.push("package contains too many files");
  let totalBytes = 0;
  for (const [filePath, contents] of files) {
    const pathError = validateDesignSystemPath(filePath);
    if (pathError) errors.push(`${filePath}: ${pathError}`);
    totalBytes += contents.byteLength;
    const max = /^(assets)\//.test(filePath)
      ? DESIGN_SYSTEM_LIMITS.maxAssetFileBytes
      : DESIGN_SYSTEM_LIMITS.maxOrdinaryFileBytes;
    if (contents.byteLength > max) errors.push(`${filePath} exceeds its size limit`);
    const declaredBinary =
      filePath.startsWith("assets/") || /^preview\/(?:foundations|components)\.png$/.test(filePath);
    if (
      /\.(?:exe|dll|dylib|so|wasm|class|jar)$/i.test(filePath) ||
      (!declaredBinary && contents.includes(0))
    ) {
      errors.push(`${filePath} is an undeclared executable or binary`);
    }
    if (/\.(?:json|md|css|tsx?|jsx?|html)$/i.test(filePath)) {
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(contents);
      } catch {
        errors.push(`${filePath} is not valid UTF-8`);
      }
    }
  }
  if (totalBytes > DESIGN_SYSTEM_LIMITS.maxUncompressedBytes) errors.push("package is too large");
  for (const required of REQUIRED_FILES) {
    if (!files.has(required)) errors.push(`missing required file: ${required}`);
  }
  const manifestText = files.get("manifest.json")?.toString("utf8");
  const manifest = manifestText ? parseManifest(manifestText, errors) : null;
  if (manifest) {
    for (const declared of Object.values(manifest.files)) {
      if (!files.has(declared)) errors.push(`declared file is missing: ${declared}`);
    }
  }
  const tokenText = files.get("tokens.css")?.toString("utf8");
  if (tokenText) {
    validateTokens(tokenText, errors);
    if (/url\(\s*["']?https?:/i.test(tokenText))
      errors.push("tokens.css depends on a remote asset");
  }
  const componentsText = files.get("components.manifest.json")?.toString("utf8");
  if (componentsText) {
    validateComponents(componentsText, files, errors);
    const parsed = parseJson(componentsText, "components.manifest.json", errors);
    const preview = files.get("preview/components.html")?.toString("utf8").toLowerCase() ?? "";
    if (isRecord(parsed) && Array.isArray(parsed.components)) {
      for (const raw of parsed.components) {
        if (!isRecord(raw) || typeof raw.name !== "string") continue;
        for (const specimen of [raw.name]) {
          if (typeof specimen === "string" && !preview.includes(specimen.toLowerCase()))
            errors.push(`component specimen is missing from preview: ${specimen}`);
        }
      }
    }
  }
  for (const preview of ["preview/foundations.html", "preview/components.html"]) {
    const html = files.get(preview)?.toString("utf8") ?? "";
    if (html.length < 40 || /(?:src|href)=["']https?:/i.test(html)) {
      errors.push(`${preview} is incomplete or depends on remote code`);
    }
  }
  for (const preview of ["preview/foundations.png", "preview/components.png"]) {
    const body = files.get(preview);
    if (
      !body ||
      body.byteLength < 32 ||
      !body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
      !body.includes(Buffer.from("IEND"))
    )
      errors.push(`${preview} is incomplete`);
  }
  return { valid: errors.length === 0, errors, manifest };
}

export function designSystemCommitStorageKey(
  organizationId: string,
  designSystemId: string,
  commitSha: string,
): string {
  return `design-system-commits/${organizationId}/${designSystemId}/${commitSha}/workbench.tar.gz`;
}

export function designSystemVersionStorageKey(
  organizationId: string,
  designSystemId: string,
  versionId: string,
): string {
  return `design-systems/${organizationId}/${designSystemId}/${versionId}/package.tar.gz`;
}
