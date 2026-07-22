import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { extract } from "tar-stream";
import {
  DESIGN_SYSTEM_LIMITS,
  validateDesignSystemPackage,
  validateDesignSystemPath,
} from "@trace/shared";

export type DesignSystemPackageDescriptor = {
  versionId: string;
  downloadUrl: string;
  contentDigest: string;
  byteSize: number;
};

async function downloadPackage(descriptor: DesignSystemPackageDescriptor): Promise<Buffer> {
  if (descriptor.byteSize <= 0 || descriptor.byteSize > DESIGN_SYSTEM_LIMITS.maxCompressedBytes) {
    throw new Error("Design-system package size is outside allowed limits");
  }
  const response = await fetch(descriptor.downloadUrl, { redirect: "error" });
  if (!response.ok || !response.body)
    throw new Error(`Design-system download failed (${response.status})`);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > DESIGN_SYSTEM_LIMITS.maxCompressedBytes || bytes > descriptor.byteSize) {
      await reader.cancel();
      throw new Error("Design-system download exceeded its declared size");
    }
    chunks.push(Buffer.from(value));
  }
  const result = Buffer.concat(chunks);
  if (result.byteLength !== descriptor.byteSize)
    throw new Error("Design-system package size mismatch");
  const digest = createHash("sha256").update(result).digest("hex");
  if (digest !== descriptor.contentDigest) throw new Error("Design-system package digest mismatch");
  return result;
}

function extractPackage(bytes: Buffer): Promise<Map<string, Buffer>> {
  let tar: Buffer;
  try {
    tar = gunzipSync(bytes, { maxOutputLength: DESIGN_SYSTEM_LIMITS.maxUncompressedBytes + 1 });
  } catch {
    throw new Error("Design-system package is not a valid bounded gzip archive");
  }
  return new Promise((resolve, reject) => {
    const parser = extract();
    const files = new Map<string, Buffer>();
    let total = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
      parser.destroy(error);
    };
    parser.on("entry", (header, stream, next) => {
      if (header.type === "directory") {
        stream.resume();
        stream.once("end", next);
        return;
      }
      if (header.type !== "file" || !header.name.startsWith("design-system/")) {
        stream.resume();
        fail(new Error("Design-system archive contains an unsafe or out-of-root entry"));
        return;
      }
      const relative = header.name.slice("design-system/".length);
      const pathError = validateDesignSystemPath(relative);
      if (pathError || files.has(relative) || files.size >= DESIGN_SYSTEM_LIMITS.maxFiles) {
        stream.resume();
        fail(new Error(`Unsafe design-system archive path: ${relative}`));
        return;
      }
      const chunks: Buffer[] = [];
      let fileBytes = 0;
      const maxFile = relative.startsWith("assets/")
        ? DESIGN_SYSTEM_LIMITS.maxAssetFileBytes
        : DESIGN_SYSTEM_LIMITS.maxOrdinaryFileBytes;
      stream.on("data", (chunk: Buffer) => {
        fileBytes += chunk.byteLength;
        total += chunk.byteLength;
        if (fileBytes > maxFile || total > DESIGN_SYSTEM_LIMITS.maxUncompressedBytes) {
          fail(new Error("Design-system package exceeds extraction limits"));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      stream.once("end", () => {
        if (settled) return;
        files.set(relative, Buffer.concat(chunks));
        next();
      });
      stream.once("error", fail);
    });
    parser.once("finish", () => {
      if (!settled) {
        settled = true;
        resolve(files);
      }
    });
    parser.once("error", fail);
    parser.end(tar);
  });
}

function cssValue(css: string, name: string, fallback: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*:\\s*([^;]+);`).exec(css)?.[1].trim() ?? fallback;
}

function compatibilityTokens(files: ReadonlyMap<string, Buffer>): Record<string, unknown> {
  const css = files.get("tokens.css")?.toString("utf8") ?? "";
  const manifest = JSON.parse(files.get("manifest.json")?.toString("utf8") ?? "{}") as {
    name?: string;
    description?: string;
  };
  const numberValue = (name: string, fallback: number) => {
    const parsed = Number.parseFloat(cssValue(css, name, String(fallback)));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    direction: {
      name: manifest.name ?? "Selected design system",
      rationale: manifest.description ?? "Materialized Trace package",
    },
    color: {
      background: cssValue(css, "--background", "#09090b"),
      surface: cssValue(css, "--surface", "#18181b"),
      foreground: cssValue(css, "--foreground", "#fafafa"),
      muted: cssValue(css, "--muted-foreground", "#a1a1aa"),
      border: cssValue(css, "--border", "#3f3f46"),
      primary: cssValue(css, "--accent", "#fafafa"),
      primaryForeground: cssValue(css, "--accent-foreground", "#09090b"),
      secondary: cssValue(css, "--surface", "#71717a"),
      success: cssValue(css, "--success", "#22c55e"),
      warning: cssValue(css, "--warning", "#f59e0b"),
      danger: cssValue(css, "--destructive", "#ef4444"),
      dangerForeground: cssValue(css, "--accent-foreground", "#fff"),
    },
    typography: {
      display: cssValue(css, "--font-sans", "system-ui"),
      body: cssValue(css, "--font-sans", "system-ui"),
      mono: "ui-monospace, monospace",
      scale: "1.25",
    },
    spacing: { base: numberValue("--space-1", 4), density: "balanced" },
    radius: { control: numberValue("--radius", 8), surface: numberValue("--radius", 16) },
    elevation: { surface: cssValue(css, "--shadow", "0 16px 48px rgb(0 0 0 / .24)") },
    motion: { duration: numberValue("--motion-duration", 180), easing: "ease" },
  };
}

export async function materializeDesignSystemPackage(
  workdir: string,
  descriptor: DesignSystemPackageDescriptor,
): Promise<void> {
  const startedAt = Date.now();
  const bytes = await downloadPackage(descriptor);
  const files = await extractPackage(bytes);
  const validation = validateDesignSystemPackage(files);
  if (!validation.valid)
    throw new Error(`Invalid design-system package: ${validation.errors.join("; ")}`);
  const target = path.join(workdir, "design-system");
  const temp = path.join(workdir, `.design-system-${randomUUID()}`);
  const backup = path.join(workdir, `.design-system-backup-${randomUUID()}`);
  await fs.mkdir(temp);
  try {
    for (const [relative, body] of files) {
      const destination = path.join(temp, ...relative.split("/"));
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, body, { mode: 0o644 });
    }
    const hadTarget = await fs
      .stat(target)
      .then(() => true)
      .catch(() => false);
    if (hadTarget) await fs.rename(target, backup);
    try {
      await fs.rename(temp, target);
      const tokenTemp = path.join(workdir, `.trace.tokens-${randomUUID()}.json`);
      await fs.writeFile(tokenTemp, JSON.stringify(compatibilityTokens(files), null, 2));
      await fs.rename(tokenTemp, path.join(workdir, "trace.tokens.json"));
      await fs.rm(backup, { recursive: true, force: true });
    } catch (error) {
      await fs.rm(target, { recursive: true, force: true });
      if (hadTarget) await fs.rename(backup, target);
      throw error;
    }
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
    await fs.rm(backup, { recursive: true, force: true });
  }
  console.info("[design-system] package materialized", {
    versionId: descriptor.versionId,
    byteSize: descriptor.byteSize,
    fileCount: files.size,
    digestPrefix: descriptor.contentDigest.slice(0, 12),
    durationMs: Date.now() - startedAt,
  });
}
