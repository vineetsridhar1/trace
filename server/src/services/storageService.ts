// TODO: Replace DiskStorageAdapter with S3StorageAdapter for AWS deployment
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface StorageAdapter {
  store(key: string, buffer: Buffer): Promise<void>;
  retrieve(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  localPath(key: string): string;
  url(key: string): string;
}

export class DiskStorageAdapter implements StorageAdapter {
  constructor(private basePath: string) {
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true });
    }
  }

  async store(key: string, buffer: Buffer): Promise<void> {
    await fs.promises.writeFile(this.localPath(key), buffer);
  }

  async retrieve(key: string): Promise<Buffer> {
    return fs.promises.readFile(this.localPath(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.localPath(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.promises.unlink(this.localPath(key));
    } catch { /* ignore missing */ }
  }

  localPath(key: string): string {
    return path.join(this.basePath, key);
  }

  url(key: string): string {
    return `/attachments/file/${key}`;
  }
}

export function generateStorageKey(buffer: Buffer, filename: string): string {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const ext = path.extname(filename).toLowerCase() || '.bin';
  return `${hash}${ext}`;
}

export function computeChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

let adapter: StorageAdapter | null = null;

export function initStorage(storagePath: string): StorageAdapter {
  adapter = new DiskStorageAdapter(storagePath);
  return adapter;
}

export function getStorage(): StorageAdapter {
  if (!adapter) throw new Error('Storage not initialized. Call initStorage() first.');
  return adapter;
}
