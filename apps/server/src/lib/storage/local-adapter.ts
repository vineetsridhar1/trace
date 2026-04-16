import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import type { StorageAdapter } from "./types.js";

const JWT_SECRET = process.env.JWT_SECRET || "trace-dev-secret";

export interface LocalStorageToken {
  key: string;
  action: "put" | "get";
  contentType?: string;
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly rootDir: string;
  private publicUrl: string;

  constructor() {
    this.rootDir = process.env.LOCAL_STORAGE_DIR
      ? path.resolve(process.env.LOCAL_STORAGE_DIR)
      : path.resolve(process.cwd(), "tmp/uploads");
    this.publicUrl = process.env.STORAGE_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  async getPutUrl(key: string, contentType: string): Promise<string> {
    const token = jwt.sign({ key, action: "put", contentType }, JWT_SECRET, { expiresIn: "5m" });
    return `${this.publicUrl}/uploads/local/put/${token}`;
  }

  async getGetUrl(key: string): Promise<string> {
    const token = jwt.sign({ key, action: "get" }, JWT_SECRET, { expiresIn: "1h" });
    return `${this.publicUrl}/uploads/local/get/${token}`;
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
