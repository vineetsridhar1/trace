import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

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
const onlineServerUrl = process.env.TRACE_ONLINE_SERVER_URL ?? "https://app.gettrace.org";
const configuredOnlineWebUrl = process.env.TRACE_ONLINE_WEB_URL;

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

async function waitForHttp(url, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("The online web development server exited during startup");
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Retry until Vite is ready.
    }
    await sleep(300);
  }
  throw new Error("Timed out starting the online web development server");
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

let onlineWebProcess = null;
let onlineWebUrl = configuredOnlineWebUrl ?? "https://app.gettrace.org";
try {
  if (startOnline && !configuredOnlineWebUrl) {
    onlineWebUrl = "http://localhost:3000";
    console.log("[trace-local] starting the current online web UI on localhost:3000");
    onlineWebProcess = spawn(
      "pnpm",
      ["--filter", "@trace/web", "dev", "--host", "127.0.0.1", "--port", "3000", "--strictPort"],
      {
        cwd: repoRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          VITE_API_URL: onlineServerUrl,
          VITE_TRACE_LOCAL_MODE: "0",
        },
      },
    );
    await waitForHttp(onlineWebUrl, onlineWebProcess);
  }

  run("pnpm", ["--filter", "@trace/desktop", "dev"], {
    ...process.env,
    TRACE_LOCAL_MODE: "1",
    TRACE_LOCAL_APP_DATA_PATH: appDataRoot,
    TRACE_SERVER_URL: onlineServerUrl,
    TRACE_WEB_URL: onlineWebUrl,
  });
} finally {
  onlineWebProcess?.kill("SIGTERM");
}
