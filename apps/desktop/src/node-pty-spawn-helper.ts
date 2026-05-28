import fs from "node:fs";
import path from "node:path";

export type RepairNodePtySpawnHelperDeps = {
  readdirSync: typeof fs.readdirSync;
  chmodSync: typeof fs.chmodSync;
};

export type RepairNodePtySpawnHelperOptions = {
  resourcesPath: string;
  deps?: RepairNodePtySpawnHelperDeps;
};

const EXECUTABLE_MODE = 0o755;

function isNodePtySpawnHelper(filePath: string): boolean {
  return (
    path.basename(filePath) === "spawn-helper" &&
    filePath.includes(`${path.sep}node-pty${path.sep}prebuilds${path.sep}`)
  );
}

function visit(dir: string, deps: RepairNodePtySpawnHelperDeps): number {
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
      repaired += visit(entryPath, deps);
      continue;
    }

    if (entry.isFile() && isNodePtySpawnHelper(entryPath)) {
      deps.chmodSync(entryPath, EXECUTABLE_MODE);
      repaired += 1;
    }
  }

  return repaired;
}

export function repairNodePtySpawnHelpers({
  resourcesPath,
  deps = fs,
}: RepairNodePtySpawnHelperOptions): number {
  return visit(path.join(resourcesPath, "app.asar.unpacked"), deps);
}
