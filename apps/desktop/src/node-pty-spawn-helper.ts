import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export type RepairNodePtySpawnHelperDeps = {
  readdirSync: typeof fs.readdirSync;
  chmodSync: typeof fs.chmodSync;
  copyFileSync: typeof fs.copyFileSync;
  existsSync: typeof fs.existsSync;
  removeQuarantineAttribute: (filePath: string) => void;
};

export type RepairNodePtySpawnHelperOptions = {
  resourcesPath: string;
  deps?: RepairNodePtySpawnHelperDeps;
};

const EXECUTABLE_MODE = 0o755;

function removeQuarantineAttribute(filePath: string): void {
  if (process.platform !== "darwin") return;

  spawnSync("/usr/bin/xattr", ["-d", "com.apple.quarantine", filePath], {
    stdio: "ignore",
  });
}

const defaultDeps: RepairNodePtySpawnHelperDeps = {
  readdirSync: fs.readdirSync,
  chmodSync: fs.chmodSync,
  copyFileSync: fs.copyFileSync,
  existsSync: fs.existsSync,
  removeQuarantineAttribute,
};

function isNodePtySpawnHelper(filePath: string): boolean {
  return (
    path.basename(filePath) === "spawn-helper" &&
    filePath.includes(`${path.sep}node-pty${path.sep}prebuilds${path.sep}`)
  );
}

function isDarwinNodePtyNative(filePath: string): boolean {
  return (
    path.basename(filePath) === "pty.node" &&
    filePath.includes(`${path.sep}node-pty${path.sep}`) &&
    !filePath.includes(`${path.sep}prebuilds${path.sep}win32-`)
  );
}

function isCurrentDarwinHelper(filePath: string): boolean {
  return filePath.includes(
    `${path.sep}node-pty${path.sep}prebuilds${path.sep}darwin-${process.arch}${path.sep}spawn-helper`,
  );
}

function visit(
  dir: string,
  deps: RepairNodePtySpawnHelperDeps,
  state: { currentDarwinHelperPath: string | null; nativeDirs: Set<string> },
): number {
  let entries: fs.Dirent[];
  try {
    entries = deps.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  let repaired = 0;
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      repaired += visit(entryPath, deps, state);
      continue;
    }

    if (entry.isFile() && isNodePtySpawnHelper(entryPath)) {
      if (isCurrentDarwinHelper(entryPath)) {
        state.currentDarwinHelperPath = entryPath;
      }
      deps.chmodSync(entryPath, EXECUTABLE_MODE);
      deps.removeQuarantineAttribute(entryPath);
      repaired += 1;
      continue;
    }

    if (entry.isFile() && isDarwinNodePtyNative(entryPath)) {
      state.nativeDirs.add(path.dirname(entryPath));
    }
  }

  return repaired;
}

export function repairNodePtySpawnHelpers({
  resourcesPath,
  deps = defaultDeps,
}: RepairNodePtySpawnHelperOptions): number {
  const state = {
    currentDarwinHelperPath: null as string | null,
    nativeDirs: new Set<string>(),
  };
  let repaired = visit(path.join(resourcesPath, "app.asar.unpacked"), deps, state);

  if (!state.currentDarwinHelperPath) return repaired;

  for (const nativeDir of state.nativeDirs) {
    const adjacentHelperPath = path.join(nativeDir, "spawn-helper");
    if (!deps.existsSync(adjacentHelperPath)) {
      deps.copyFileSync(state.currentDarwinHelperPath, adjacentHelperPath);
    }
    deps.chmodSync(adjacentHelperPath, EXECUTABLE_MODE);
    deps.removeQuarantineAttribute(adjacentHelperPath);
    repaired += 1;
  }

  return repaired;
}
