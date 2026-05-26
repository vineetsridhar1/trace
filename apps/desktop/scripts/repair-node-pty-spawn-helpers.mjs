import { chmod, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function repairNodePtySpawnHelpers(rootDir) {
  async function visit(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return 0;
    }

    const counts = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return visit(entryPath);
        }

        if (
          entry.isFile() &&
          entry.name === "spawn-helper" &&
          entryPath.includes(`${path.sep}node-pty${path.sep}prebuilds${path.sep}`)
        ) {
          await chmod(entryPath, 0o755);
          return 1;
        }

        return 0;
      }),
    );

    return counts.reduce((sum, count) => sum + count, 0);
  }

  return visit(path.join(rootDir, "node_modules"));
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  const rootDir = process.argv[2];
  if (!rootDir) {
    console.error("Usage: node repair-node-pty-spawn-helpers.mjs <deploy-root>");
    process.exit(1);
  }

  const repaired = await repairNodePtySpawnHelpers(rootDir);
  if (repaired === 0) {
    console.warn(`No node-pty spawn-helper files found under ${rootDir}`);
  }
}
