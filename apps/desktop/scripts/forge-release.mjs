import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { repairNodePtySpawnHelpers } from "./repair-node-pty-spawn-helpers.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(desktopDir, "../..");
const releaseDir = path.join(repoRoot, "out", "desktop-release");
const buildConfigPath = path.join(desktopDir, "dist", "build-config.json");
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

const productionUrl = process.env.TRACE_PRODUCTION_URL;
const updateRepo = process.env.TRACE_DESKTOP_UPDATE_REPO;

if (!productionUrl) {
  console.error("TRACE_PRODUCTION_URL must be set (e.g. https://app.gettrace.org)");
  process.exit(1);
}

if (!updateRepo || !updateRepo.includes("/")) {
  console.error(
    'TRACE_DESKTOP_UPDATE_REPO must be set in "owner/name" form (e.g. vineetsridhar1/trace)',
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
  await writeFile(
    buildConfigPath,
    JSON.stringify({ productionUrl, macUpdateRepo: updateRepo }, null, 2) + "\n",
  );
  run("pnpm", ["--filter", "@trace/desktop", "deploy", "--legacy", releaseDir]);
}

await repairNodePtySpawnHelpers(releaseDir);
run("pnpm", ["exec", "electron-forge", command, ...forgeArgs, releaseDir]);
await repairNodePtySpawnHelpers(releaseDir);
