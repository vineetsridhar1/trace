import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const runtimeRoot = path.join(repoRoot, "out", "desktop-local-runtime");
const postgresRoot = path.join(runtimeRoot, "local-postgres");
const appDataRoot = path.join(repoRoot, "out", "desktop-local-user-data");
const postgresBinary = path.join(
  postgresRoot,
  "bin",
  process.platform === "win32" ? "postgres.exe" : "postgres",
);
const postgresVersionPath = path.join(postgresRoot, ".trace-postgres-version");
const startOnline = process.argv.slice(2).includes("--online");

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasCurrentPostgres() {
  if (!(await exists(postgresBinary))) return false;
  return readFile(postgresVersionPath, "utf8")
    .then((version) => version.trim() === "17.10.0")
    .catch(() => false);
}

await mkdir(runtimeRoot, { recursive: true });
if (!(await hasCurrentPostgres())) {
  console.log("[trace-local] staging embedded PostgreSQL");
  run("node", ["apps/desktop/scripts/download-local-postgres.mjs", postgresRoot]);
  run("node", ["apps/desktop/scripts/repair-local-postgres-macos.mjs", postgresRoot]);
}

console.log("[trace-local] building the local server and web bundles");
run("pnpm", ["codegen"]);
run("pnpm", ["--filter", "@trace/server", "build"]);
run("pnpm", ["--filter", "@trace/web", "build"], {
  ...process.env,
  VITE_API_URL: "",
  VITE_WS_URL: "",
  VITE_TRACE_LOCAL_MODE: "1",
});

console.log("[trace-local] opening Electron with the embedded runtime");
if (startOnline) {
  await mkdir(appDataRoot, { recursive: true });
  await writeFile(path.join(appDataRoot, "trace-mode.json"), '{\n  "mode": "online"\n}\n', {
    mode: 0o600,
  });
}
run("pnpm", ["--filter", "@trace/desktop", "dev"], {
  ...process.env,
  TRACE_LOCAL_MODE: "1",
  TRACE_LOCAL_APP_DATA_PATH: appDataRoot,
  TRACE_SERVER_URL: process.env.TRACE_ONLINE_SERVER_URL ?? "https://app.gettrace.org",
  TRACE_WEB_URL: process.env.TRACE_ONLINE_WEB_URL ?? "https://app.gettrace.org",
});
