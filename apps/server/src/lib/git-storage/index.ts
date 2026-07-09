import type { GitStorageAdapter } from "./types.js";
import { LocalGitStorageAdapter } from "./local-adapter.js";

// Only a local filesystem adapter exists for v1 (single-writer durable volume).
// The env switch mirrors STORAGE_MODE so a future object-store or sharded
// adapter can be selected without touching callers.
const mode = process.env.GIT_STORAGE_MODE ?? "local";

let adapter: GitStorageAdapter;
if (mode === "local") {
  const local = new LocalGitStorageAdapter();
  adapter = local;
  console.log(`[git-storage] Local mode — bare repos stored in ${local.rootDir}`);
} else {
  throw new Error(`Unknown GIT_STORAGE_MODE: ${mode} (expected "local")`);
}

export const gitStorage: GitStorageAdapter = adapter;
export { LocalGitStorageAdapter, assertSafeStorageId } from "./local-adapter.js";
export type { GitStorageAdapter } from "./types.js";
