import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import jwt from "jsonwebtoken";
import type { StorageAdapter } from "./types.js";

// Tokens for local storage PUT/GET URLs are signed with JWT_SECRET. Falling
// back to a constant in dev is acceptable; in any other environment a missing
// secret would let anyone forge upload/download URLs against the server's disk.
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return "trace-dev-secret";
  }
  throw new Error("JWT_SECRET is required when STORAGE_MODE=local outside development");
}

const JWT_SECRET = resolveJwtSecret();

export interface LocalStorageToken {
  key: string;
  action: "put" | "get";
  contentType?: string;
  maxBytes?: number;
  downloadFilename?: string;
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly rootDir: string;
  private publicUrl: string;

  constructor() {
    this.rootDir = process.env.LOCAL_STORAGE_DIR
      ? path.resolve(process.env.LOCAL_STORAGE_DIR)
      : path.resolve(process.cwd(), "tmp/uploads");
    // This adapter is selected only for STORAGE_MODE=local. Remote bridges
    // still need a reachable signed PUT endpoint, so reuse the server's public
    // URL unless storage has its own explicit public origin.
    this.publicUrl = (
      process.env.STORAGE_PUBLIC_URL?.trim() ||
      process.env.TRACE_SERVER_PUBLIC_URL?.trim() ||
      `http://localhost:${process.env.PORT ?? 4000}`
    ).replace(/\/$/, "");
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  async getUploadTarget(key: string, contentType: string, maxBytes: number) {
    const token = jwt.sign({ key, action: "put", contentType, maxBytes }, JWT_SECRET, {
      expiresIn: "5m",
    });
    return { method: "PUT" as const, url: `${this.publicUrl}/uploads/local/put/${token}` };
  }

  async putObject(key: string, body: Buffer): Promise<void> {
    const filePath = this.resolvePath(key);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, body);
  }

  async getObject(key: string): Promise<Buffer> {
    return fsp.readFile(this.resolvePath(key));
  }

  async getGetUrl(key: string, options?: { downloadFilename?: string }): Promise<string> {
    const token = jwt.sign(
      { key, action: "get", downloadFilename: options?.downloadFilename },
      JWT_SECRET,
      { expiresIn: "1h" },
    );
    return `${this.publicUrl}/uploads/local/get/${token}`;
  }

  async deleteObject(key: string): Promise<void> {
    await fsp.rm(this.resolvePath(key), { force: true });
  }

  /** Resolve a key to its on-disk path, blocking path traversal. */
  resolvePath(key: string): string {
    const resolved = path.resolve(this.rootDir, key);
    if (!resolved.startsWith(this.rootDir + path.sep) && resolved !== this.rootDir) {
      throw new Error("Invalid key");
    }
    return resolved;
  }

  verifyToken(token: string): LocalStorageToken | null {
    try {
      return jwt.verify(token, JWT_SECRET) as LocalStorageToken;
    } catch {
      return null;
    }
  }
}
