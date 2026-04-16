import type { Router } from "express";
import type { StorageAdapter } from "./types.js";
import { S3StorageAdapter } from "./s3-adapter.js";
import { LocalStorageAdapter } from "./local-adapter.js";
import { createLocalStorageRouter } from "./local-routes.js";

const mode = process.env.STORAGE_MODE ?? "s3";

let adapter: StorageAdapter;
let localRouter: Router | null = null;

if (mode === "local") {
  const localAdapter = new LocalStorageAdapter();
  adapter = localAdapter;
  localRouter = createLocalStorageRouter(localAdapter);
  console.log(`[storage] Local mode — files stored in ${localAdapter.rootDir}`);
} else if (mode === "s3") {
  adapter = new S3StorageAdapter();
} else {
  throw new Error(`Unknown STORAGE_MODE: ${mode} (expected "s3" or "local")`);
}

export const storage: StorageAdapter = adapter;
export const localStorageRouter: Router | null = localRouter;
export type { StorageAdapter } from "./types.js";
