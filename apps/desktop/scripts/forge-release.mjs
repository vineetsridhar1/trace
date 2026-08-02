import { existsSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { repairNodePtySpawnHelpers } from "./repair-node-pty-spawn-helpers.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(desktopDir, "../..");
const releaseDir = path.join(repoRoot, "out", "desktop-release");
const localRuntimeDir = path.join(repoRoot, "out", "desktop-local-runtime");
const buildConfigPath = path.join(desktopDir, "dist", "build-config.json");
const command = process.argv[2];
const forgeArgs = process.argv.slice(3).filter((arg) => arg !== "--");

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

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: "inherit",
    env: { ...process.env, ...options.env },
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
  await rm(localRuntimeDir, { recursive: true, force: true });
  await mkdir(localRuntimeDir, { recursive: true });

  run("node", [
    path.join(desktopDir, "scripts", "download-local-postgres.mjs"),
    path.join(localRuntimeDir, "local-postgres"),
  ]);
  run("node", [
    path.join(desktopDir, "scripts", "repair-local-postgres-macos.mjs"),
    path.join(localRuntimeDir, "local-postgres"),
  ]);
  run("pnpm", ["codegen"]);
  run("pnpm", ["--filter", "@trace/server", "build"]);
  run("pnpm", ["--filter", "@trace/web", "build"], {
    env: { VITE_API_URL: "", VITE_WS_URL: "", VITE_TRACE_LOCAL_MODE: "1" },
  });
  run("pnpm", [
    "--filter",
    "@trace/server",
    "deploy",
    "--prod",
    "--legacy",
    path.join(localRuntimeDir, "local-server"),
  ]);
  run(
    "node",
    ["node_modules/prisma/build/index.js", "generate", "--schema", "prisma/schema.prisma"],
    { cwd: path.join(localRuntimeDir, "local-server") },
  );
  run("node", [
    path.join(desktopDir, "scripts", "prune-local-server.mjs"),
    path.join(localRuntimeDir, "local-server"),
  ]);
  await cp(path.join(repoRoot, "apps", "web", "dist"), path.join(localRuntimeDir, "local-web"), {
    recursive: true,
  });

  run("pnpm", ["--filter", "@trace/desktop", "build"]);
  await writeFile(
    buildConfigPath,
    JSON.stringify({ productionUrl, macUpdateRepo: updateRepo }, null, 2) + "\n",
  );
  run("pnpm", ["--filter", "@trace/desktop", "deploy", "--legacy", releaseDir]);
}

await repairNodePtySpawnHelpers(releaseDir);
run("pnpm", ["exec", "electron-forge", command, ...forgeArgs, releaseDir], {
  env: { TRACE_LOCAL_RUNTIME_DIR: localRuntimeDir },
});
await repairNodePtySpawnHelpers(releaseDir);
