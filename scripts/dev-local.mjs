import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const cwd = process.cwd();
const portOffset = Number(process.env.TRACE_PORT || 0);

const serverPort = 4000 + portOffset;
const webPort = 3000 + portOffset;
const prismaDevPort = 5690 + portOffset;
const databasePort = 5691 + portOffset;
const shadowDatabasePort = 5692 + portOffset;
const serverUrl = `http://localhost:${serverPort}`;
const webUrl = `http://localhost:${webPort}`;
const prismaServerName = `trace-local-${hashValue(cwd)}-${portOffset}`;

const jwtSecret = process.env.JWT_SECRET ?? randomHex(32);
const tokenEncryptionKey = process.env.TOKEN_ENCRYPTION_KEY ?? randomHex(32);

const sharedEnv = {
  ...process.env,
  TRACE_PORT: String(portOffset),
  TRACE_LOCAL_MODE: "1",
  JWT_SECRET: jwtSecret,
  TOKEN_ENCRYPTION_KEY: tokenEncryptionKey,
  TRACE_SERVER_PUBLIC_URL: serverUrl,
  TRACE_SERVER_URL: serverUrl,
  TRACE_WEB_URL: webUrl,
  CORS_ALLOWED_ORIGINS: webUrl,
  STORAGE_MODE: "local",
  STORAGE_PUBLIC_URL: serverUrl,
  NODE_ENV: process.env.NODE_ENV ?? "development",
};

const webEnv = {
  ...sharedEnv,
  VITE_TRACE_LOCAL_MODE: "1",
  VITE_ENABLE_AGENT: "0",
  VITE_ENABLE_AGENT_DEBUG: "0",
};

const children = new Set();
let shuttingDown = false;

function randomHex(bytes) {
  return randomBytes(bytes).toString("hex");
}

function hashValue(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function log(message) {
  console.log(`[trace-local] ${message}`);
}

function stripAnsi(text) {
  return text.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function getPrismaDevStateRoot() {
  const home = homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "prisma-dev-nodejs");
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"),
      "prisma-dev-nodejs",
      "Data",
    );
  }
  return path.join(
    process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share"),
    "prisma-dev-nodejs",
  );
}

function buildPrismaDevDatabaseUrl(port) {
  const params = new URLSearchParams({
    sslmode: "disable",
    connection_limit: "1",
    pgbouncer: "true",
    connect_timeout: "0",
    max_idle_connection_lifetime: "0",
    pool_timeout: "0",
    socket_timeout: "0",
  });
  return `postgres://postgres:postgres@localhost:${port}/template1?${params.toString()}`;
}

function normalizeLocalDatabaseUrl(url) {
  const parsed = new URL(url);
  parsed.searchParams.set("sslmode", "disable");
  // Prisma's local Postgres server accepts one connection at a time and
  // behaves like a pooled/proxied connection path for prepared statements.
  parsed.searchParams.set("connection_limit", "1");
  parsed.searchParams.set("pgbouncer", "true");
  parsed.searchParams.set("connect_timeout", "0");
  parsed.searchParams.set("max_idle_connection_lifetime", "0");
  parsed.searchParams.set("pool_timeout", "0");
  parsed.searchParams.set("socket_timeout", "0");
  return parsed.toString();
}

async function readPrismaDevState() {
  const statePath = path.join(getPrismaDevStateRoot(), prismaServerName, "server.json");
  try {
    const raw = await readFile(statePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function getPrismaDevStateUrl(state) {
  const exportedUrl = state?.exports?.database?.prismaORMConnectionString;
  if (typeof exportedUrl === "string" && exportedUrl.length > 0) {
    return normalizeLocalDatabaseUrl(exportedUrl);
  }

  const databasePort = state?.databasePort;
  if (Number.isInteger(databasePort) && databasePort > 0) {
    return buildPrismaDevDatabaseUrl(databasePort);
  }

  return null;
}

function parsePrismaDevStatus(line) {
  if (line.includes("not_running") || line.includes("not running")) {
    return "not_running";
  }
  if (line.includes("running")) {
    return "running";
  }
  return "unknown";
}

async function findBrokenMigrationDirectories() {
  const migrationsRoot = path.join(cwd, "apps", "server", "prisma", "migrations");
  const entries = await readdir(migrationsRoot, { withFileTypes: true });
  const broken = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const migrationFile = path.join(migrationsRoot, entry.name, "migration.sql");
    try {
      await access(migrationFile);
    } catch {
      broken.push(entry.name);
    }
  }

  return broken;
}

function shouldFallbackToSchemaSync(error) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("P3015") ||
    error.message.includes("Could not find the migration file at migration.sql")
  );
}

function assertNodeVersion() {
  const [major] = process.versions.node.split(".");
  if (Number(major) >= 22) return;

  console.error(
    `[trace-local] Node ${process.versions.node} detected. Local mode requires Node 22+ for Prisma dev.`,
  );
  process.exit(1);
}

function spawnLongRunning(label, args, env) {
  const child = spawn(pnpmCommand, args, {
    cwd,
    env,
    stdio: "inherit",
  });
  children.add(child);

  child.on("exit", (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;

    if (label === "electron" && (code === 0 || signal === "SIGTERM")) {
      void shutdown(0);
      return;
    }

    const reason =
      signal != null
        ? `${label} exited from signal ${signal}`
        : `${label} exited with code ${code ?? 1}`;
    console.error(`[trace-local] ${reason}`);
    void shutdown(code ?? 1);
  });

  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(`[trace-local] failed to start ${label}:`, error);
    void shutdown(1);
  });

  return child;
}

async function runCommand(label, args, env = process.env, stdinText = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpmCommand, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.stdin?.end(stdinText ?? "");

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stripAnsi(`${stdout}${stderr}`));
        return;
      }

      reject(
        new Error(
          `[${label}] exited with code ${code ?? 1}\n${stripAnsi(`${stdout}${stderr}`)}`.trim(),
        ),
      );
    });
  });
}

async function getPrismaDevEntry() {
  const output = await runCommand("prisma dev ls", [
    "--filter",
    "@trace/server",
    "exec",
    "prisma",
    "dev",
    "ls",
  ]);

  const line = output
    .split("\n")
    .map((value) => value.trim())
    .find((value) => value.startsWith(prismaServerName));

  if (!line) return null;

  const cliUrls = line.match(/\b(?:prisma\+postgres|postgres(?:ql)?|https?):\/\/\S+/g) ?? [];
  const state = await readPrismaDevState();
  const stateUrl = getPrismaDevStateUrl(state);
  const urls = stateUrl ? [stateUrl, ...cliUrls] : cliUrls;
  const status = parsePrismaDevStatus(line);

  return { status, urls };
}

function getDirectDatabaseUrl(urls) {
  return urls.find((url) => /^postgres(?:ql)?:\/\//.test(url));
}

async function ensurePrismaDev() {
  const existing = await getPrismaDevEntry();
  if (!existing) {
    log(`creating Prisma dev server "${prismaServerName}"`);
    await runCommand(
      "prisma dev",
      [
        "--filter",
        "@trace/server",
        "exec",
        "prisma",
        "dev",
        "-d",
        "-n",
        prismaServerName,
        "-p",
        String(prismaDevPort),
        "-P",
        String(databasePort),
        "--shadow-db-port",
        String(shadowDatabasePort),
      ],
      sharedEnv,
    );
  } else if (existing.status !== "running") {
    log(`starting Prisma dev server "${prismaServerName}"`);
    await runCommand(
      "prisma dev start",
      ["--filter", "@trace/server", "exec", "prisma", "dev", "start", prismaServerName],
      sharedEnv,
    );
  } else {
    log(`reusing Prisma dev server "${prismaServerName}"`);
  }

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const entry = await getPrismaDevEntry();
    const databaseUrl = entry ? getDirectDatabaseUrl(entry.urls) : null;
    if (entry?.status === "running" && databaseUrl) {
      return databaseUrl;
    }
    await sleep(1_000);
  }

  throw new Error("Prisma dev did not report a direct PostgreSQL connection string");
}

async function pushSchema(databaseUrl, env) {
  log("ensuring pgvector extension");
  await runCommand(
    "prisma db execute",
    ["--filter", "@trace/server", "exec", "prisma", "db", "execute", "--stdin", "--url", databaseUrl],
    env,
    "CREATE EXTENSION IF NOT EXISTS vector;",
  );

  log("syncing Prisma schema for local mode");
  await runCommand(
    "prisma db push",
    [
      "--filter",
      "@trace/server",
      "exec",
      "prisma",
      "db",
      "push",
      "--skip-generate",
      "--accept-data-loss",
    ],
    env,
  );
}

async function migrateAndSeed(databaseUrl) {
  const env = { ...sharedEnv, DATABASE_URL: databaseUrl };
  const brokenMigrations = await findBrokenMigrationDirectories();

  if (brokenMigrations.length > 0) {
    log(
      `skipping Prisma migrations in local mode because these directories are missing migration.sql: ${brokenMigrations.join(", ")}`,
    );
    await pushSchema(databaseUrl, env);
  } else {
    log("applying Prisma migrations");
    try {
      await runCommand(
        "prisma migrate deploy",
        ["--filter", "@trace/server", "exec", "prisma", "migrate", "deploy"],
        env,
      );
    } catch (error) {
      if (!shouldFallbackToSchemaSync(error)) {
        throw error;
      }

      log("Prisma migration history is incomplete locally; falling back to schema sync");
      await pushSchema(databaseUrl, env);
    }
  }

  log("seeding baseline data");
  await runCommand("db:seed", ["--filter", "@trace/server", "db:seed"], env);

  return env;
}

async function waitForHttp(url, validate, label) {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(3_000),
      });
      if (response.ok && (await validate(response))) {
        return;
      }
    } catch {
      // retry
    }

    await sleep(500);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function stopPrismaDev() {
  try {
    await runCommand(
      "prisma dev stop",
      ["--filter", "@trace/server", "exec", "prisma", "dev", "stop", prismaServerName],
      sharedEnv,
    );
  } catch {
    // Ignore stop failures during shutdown.
  }
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    child.kill("SIGTERM");
  }

  await sleep(1_000);

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }

  await stopPrismaDev();
  process.exit(exitCode);
}

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

process.on("uncaughtException", (error) => {
  console.error("[trace-local] uncaught exception:", error);
  void shutdown(1);
});

process.on("unhandledRejection", (error) => {
  console.error("[trace-local] unhandled rejection:", error);
  void shutdown(1);
});

async function main() {
  assertNodeVersion();

  log("starting local Prisma dev server");
  const databaseUrl = await ensurePrismaDev();
  const serverEnv = await migrateAndSeed(databaseUrl);

  log("starting Trace server");
  spawnLongRunning(
    "server",
    ["--filter", "@trace/server", "exec", "tsx", "watch", "src/index.ts"],
    serverEnv,
  );

  log("starting Trace web app");
  spawnLongRunning("web", ["--filter", "@trace/web", "dev"], webEnv);

  await waitForHttp(
    `${serverUrl}/health`,
    async (response) => {
      const body = await response.json().catch(() => null);
      return body?.ready === true;
    },
    "server health",
  );

  await waitForHttp(
    webUrl,
    async () => true,
    "web app",
  );

  log("opening Electron");
  spawnLongRunning("electron", ["--filter", "@trace/desktop", "dev"], sharedEnv);
}

main().catch((error) => {
  console.error("[trace-local] failed to start local mode:", error);
  void shutdown(1);
});
