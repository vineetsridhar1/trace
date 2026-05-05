import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(desktopDir, "../..");
const releaseDir = path.join(repoRoot, "out", "desktop-release");
const command = process.argv[2];
const forgeArgs = process.argv.slice(3);

const forgeCommands = new Set(["package", "make", "publish"]);
const fromDryRun =
  command === "publish" &&
  forgeArgs.some((arg) => arg === "--from-dry-run" || arg === "--from-dry-run=true");

if (!forgeCommands.has(command)) {
  console.error(
    "Usage: node scripts/forge-release.mjs <package|make|publish> [forge args]",
  );
  process.exit(1);
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (fromDryRun) {
  if (!existsSync(releaseDir)) {
    console.error(
      "No desktop release dry-run state found. Run publish:mac --dry-run first.",
    );
    process.exit(1);
  }
} else {
  await rm(releaseDir, { recursive: true, force: true });

  run("pnpm", ["--filter", "@trace/desktop", "build"]);
  run("pnpm", ["--filter", "@trace/desktop", "deploy", "--legacy", releaseDir]);
}

run("pnpm", ["exec", "electron-forge", command, ...forgeArgs, releaseDir]);
