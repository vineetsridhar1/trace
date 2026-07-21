import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { extract, pack } from "tar-stream";
import {
  DESIGN_SYSTEM_LIMITS,
  validateDesignSystemPackage,
  validateDesignSystemPath,
  type DesignSystemValidation,
} from "@trace/shared";

export type ParsedDesignSystemArchive = {
  files: Map<string, Buffer>;
  byteSize: number;
};

function readTar(tarBytes: Buffer): Promise<ParsedDesignSystemArchive> {
  return new Promise((resolve, reject) => {
    const parser = extract();
    const files = new Map<string, Buffer>();
    let byteSize = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
      parser.destroy(error);
    };
    parser.on("entry", (header, stream, next) => {
      const name = header.name.replace(/\/$/, "");
      if (header.type === "directory") {
        stream.resume();
        stream.once("end", next);
        return;
      }
      if (header.type !== "file") {
        stream.resume();
        fail(new Error(`Archive contains forbidden ${header.type ?? "special"} entry: ${name}`));
        return;
      }
      const pathError = validateDesignSystemPath(name);
      if (pathError) {
        stream.resume();
        fail(new Error(`${name}: ${pathError}`));
        return;
      }
      if (files.has(name)) {
        stream.resume();
        fail(new Error(`Archive contains duplicate path: ${name}`));
        return;
      }
      if (files.size >= DESIGN_SYSTEM_LIMITS.maxFiles) {
        stream.resume();
        fail(new Error("Archive contains too many files"));
        return;
      }
      const chunks: Buffer[] = [];
      let fileBytes = 0;
      const maxFile = name.startsWith("design-system/assets/")
        ? DESIGN_SYSTEM_LIMITS.maxAssetFileBytes
        : DESIGN_SYSTEM_LIMITS.maxOrdinaryFileBytes;
      stream.on("data", (chunk: Buffer) => {
        fileBytes += chunk.byteLength;
        byteSize += chunk.byteLength;
        if (fileBytes > maxFile || byteSize > DESIGN_SYSTEM_LIMITS.maxUncompressedBytes) {
          fail(new Error("Archive exceeds content limits"));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      stream.once("end", () => {
        if (settled) return;
        files.set(name, Buffer.concat(chunks));
        next();
      });
      stream.once("error", fail);
    });
    parser.once("finish", () => {
      if (!settled) {
        settled = true;
        resolve({ files, byteSize });
      }
    });
    parser.once("error", fail);
    parser.end(tarBytes);
  });
}

export async function parseGitTreeArchive(tarBytes: Buffer): Promise<ParsedDesignSystemArchive> {
  return readTar(tarBytes);
}

export async function parseDesignSystemTarGz(bytes: Buffer): Promise<ParsedDesignSystemArchive> {
  if (bytes.byteLength > DESIGN_SYSTEM_LIMITS.maxCompressedBytes) {
    throw new Error("Compressed design-system archive exceeds its size limit");
  }
  let tarBytes: Buffer;
  try {
    tarBytes = gunzipSync(bytes, {
      maxOutputLength: DESIGN_SYSTEM_LIMITS.maxUncompressedBytes + 1,
    });
  } catch {
    throw new Error("Design-system archive is not valid gzip data");
  }
  return readTar(tarBytes);
}

export function createDeterministicTarGz(files: ReadonlyMap<string, Buffer>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = pack();
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    archive.once("error", reject);
    archive.once("end", () => {
      try {
        resolve(gzipSync(Buffer.concat(chunks), { level: 9 }));
      } catch (error) {
        reject(error);
      }
    });
    for (const name of [...files.keys()].sort()) {
      const body = files.get(name);
      if (!body) continue;
      archive.entry(
        { name, size: body.byteLength, mode: 0o644, uid: 0, gid: 0, mtime: new Date(0) },
        body,
      );
    }
    archive.finalize();
  });
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function packageFilesFromWorkbench(
  workbenchFiles: ReadonlyMap<string, Buffer>,
): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  for (const [name, contents] of workbenchFiles) {
    if (!name.startsWith("design-system/")) continue;
    const relative = name.slice("design-system/".length);
    if (relative) result.set(relative, contents);
  }
  return result;
}

export function validateWorkbenchPackage(
  workbenchFiles: ReadonlyMap<string, Buffer>,
): DesignSystemValidation {
  return validateDesignSystemPackage(packageFilesFromWorkbench(workbenchFiles));
}
