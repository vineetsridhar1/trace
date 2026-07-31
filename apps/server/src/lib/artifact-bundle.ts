import { createHash } from "crypto";
import { createGunzip } from "zlib";
import { posix } from "path";
import { Readable } from "stream";
import tar from "tar-stream";
import { ValidationError } from "./errors.js";

const MAX_FILES = 256;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 64 * 1024 * 1024;

export type ArtifactBundleFile = {
  path: string;
  mediaType: string;
  size: number;
  digest: string;
};

export type ArtifactBundleManifest = {
  schemaVersion: 1;
  files: ArtifactBundleFile[];
};

export type ParsedArtifactBundle = {
  manifest: ArtifactBundleManifest;
  bundleDigest: string;
  files: Map<string, Buffer>;
};

function sha256(value: Buffer | string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizePath(input: string): string {
  const withoutDot = input.replace(/^\.\/+/, "");
  const normalized = posix.normalize(withoutDot);
  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    normalized.includes("\0")
  ) {
    throw new ValidationError(`Unsafe artifact path: ${input}`);
  }
  return normalized;
}

function mediaType(path: string): string {
  const extension = posix.extname(path).toLowerCase();
  switch (extension) {
    case ".md":
      return "text/markdown";
    case ".mdx":
      return "text/mdx";
    case ".json":
      return "application/json";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
}

function canonicalManifest(manifest: ArtifactBundleManifest): string {
  return JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    files: manifest.files.map((file) => ({
      path: file.path,
      mediaType: file.mediaType,
      size: file.size,
      digest: file.digest,
    })),
  });
}

export async function parseArtifactArchive(archive: Buffer): Promise<ParsedArtifactBundle> {
  if (archive.length === 0 || archive.length > MAX_BUNDLE_BYTES) {
    throw new ValidationError("Artifact archive must be between 1 byte and 64 MiB");
  }

  const files = new Map<string, Buffer>();
  let totalBytes = 0;
  const extract = tar.extract();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    extract.on("entry", (header, stream, next) => {
      if (header.type === "directory") {
        stream.resume();
        stream.on("end", next);
        return;
      }
      if (header.type !== "file") {
        stream.resume();
        fail(new ValidationError(`Artifact contains unsupported ${header.type} entry`));
        return;
      }

      let path: string;
      try {
        path = normalizePath(header.name);
      } catch (error) {
        stream.resume();
        fail(error);
        return;
      }
      if (files.has(path)) {
        stream.resume();
        fail(new ValidationError(`Artifact contains duplicate path: ${path}`));
        return;
      }
      if (files.size >= MAX_FILES) {
        stream.resume();
        fail(new ValidationError(`Artifact contains more than ${MAX_FILES} files`));
        return;
      }

      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        totalBytes += chunk.length;
        if (size > MAX_FILE_BYTES || totalBytes > MAX_BUNDLE_BYTES) {
          stream.destroy(new ValidationError("Artifact exceeds its uncompressed size limit"));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("error", fail);
      stream.on("end", () => {
        if (settled) return;
        files.set(path, Buffer.concat(chunks));
        next();
      });
    });
    extract.on("finish", () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    extract.on("error", fail);

    const gunzip = createGunzip();
    gunzip.on("error", () => fail(new ValidationError("Artifact is not a valid gzip archive")));
    Readable.from(archive).pipe(gunzip).pipe(extract);
  });

  if (files.size === 0) throw new ValidationError("Artifact contains no files");

  const manifest: ArtifactBundleManifest = {
    schemaVersion: 1,
    files: [...files.entries()]
      .map(([path, body]) => ({
        path,
        mediaType: mediaType(path),
        size: body.length,
        digest: sha256(body),
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  };

  return {
    manifest,
    bundleDigest: sha256(canonicalManifest(manifest)),
    files,
  };
}

export async function readArtifactFile(archive: Buffer, filePath: string): Promise<Buffer | null> {
  const parsed = await parseArtifactArchive(archive);
  return parsed.files.get(normalizePath(filePath)) ?? null;
}
