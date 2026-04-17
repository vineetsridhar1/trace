import { createHash } from "crypto";
import { execFile } from "child_process";
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { promisify } from "util";
import type {
  DbctlRequest,
  DbctlResponse,
  DbctlRuntimeKind,
  SessionDatabaseInfo,
  SessionDatabaseStatus,
} from "@trace/dbctl-protocol";
import { detectDatabaseProject, hashProjectInputs } from "./detect.js";

const execFileAsync = promisify(execFile);
const DEFAULT_PORT_START = 55432;
const DEFAULT_PORT_END = 56432;

type InstanceManifest = {
  worktreePath: string;
  repoId: string | null;
  repoKey: string;
  worktreeHash: string;
  buildHash: string;
  framework: string | null;
  databaseName: string | null;
  port: number | null;
  lastError: string | null;
  updatedAt: string;
};

export interface DbctlServiceOptions {
  rootDir: string;
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function ensureDir(targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson<T>(targetPath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function writeJson(targetPath: string, value: unknown): void {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, JSON.stringify(value, null, 2), "utf-8");
}

async function withLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  ensureDir(path.dirname(lockPath));

  while (true) {
    try {
      const handle = fs.openSync(lockPath, "wx");
      try {
        return await fn();
      } finally {
        fs.closeSync(handle);
        fs.rmSync(lockPath, { force: true });
      }
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: string }).code)
          : null;
      if (code !== "EEXIST") {
        throw error;
      }
      await sleep(100);
    }
  }
}

function createDatabaseInfo(
  status: SessionDatabaseStatus,
  overrides: Partial<SessionDatabaseInfo> = {},
): SessionDatabaseInfo {
  return {
    enabled: status !== "disabled",
    status,
    framework: overrides.framework ?? null,
    databaseName: overrides.databaseName ?? null,
    port: overrides.port ?? null,
    lastError: overrides.lastError ?? null,
    canReset: overrides.canReset ?? (status !== "disabled"),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
  };
}

function tailFile(filePath: string, lines = 200): string {
  try {
    const text = fs.readFileSync(filePath, "utf-8");
    return text.split("\n").slice(-lines).join("\n");
  } catch {
    return "";
  }
}

function findExistingPorts(rootDir: string): Set<number> {
  const ports = new Set<number>();
  const instancesRoot = path.join(rootDir, "instances");
  if (!fs.existsSync(instancesRoot)) return ports;
  for (const entry of fs.readdirSync(instancesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = readJson<InstanceManifest>(path.join(instancesRoot, entry.name, "manifest.json"));
    if (typeof manifest?.port === "number") {
      ports.add(manifest.port);
    }
  }
  return ports;
}

function allocatePort(rootDir: string): number {
  const used = findExistingPorts(rootDir);
  for (let portNumber = DEFAULT_PORT_START; portNumber < DEFAULT_PORT_END; portNumber += 1) {
    if (!used.has(portNumber)) return portNumber;
  }
  throw new Error("No ports available for dbctl");
}

async function resolvePostgresBinaries(): Promise<{
  initdb: string;
  pgCtl: string;
  psql: string;
  createdb: string;
  dropdb: string;
  postgres: string;
} | null> {
  const explicitDir = process.env.TRACE_DBCTL_PG_BIN_DIR;
  if (explicitDir) {
    const initdb = path.join(explicitDir, "initdb");
    const pgCtl = path.join(explicitDir, "pg_ctl");
    const psql = path.join(explicitDir, "psql");
    const createdb = path.join(explicitDir, "createdb");
    const dropdb = path.join(explicitDir, "dropdb");
    const postgres = path.join(explicitDir, "postgres");
    if ([initdb, pgCtl, psql, createdb, dropdb, postgres].every((candidate) => fs.existsSync(candidate))) {
      return { initdb, pgCtl, psql, createdb, dropdb, postgres };
    }
  }

  const initdbPath = await execFileAsync("which", ["initdb"]).then(
    ({ stdout }) => stdout.trim(),
    () => "",
  );
  const pgCtlPath = await execFileAsync("which", ["pg_ctl"]).then(
    ({ stdout }) => stdout.trim(),
    () => "",
  );
  const psqlPath = await execFileAsync("which", ["psql"]).then(
    ({ stdout }) => stdout.trim(),
    () => "",
  );
  const createdbPath = await execFileAsync("which", ["createdb"]).then(
    ({ stdout }) => stdout.trim(),
    () => "",
  );
  const dropdbPath = await execFileAsync("which", ["dropdb"]).then(
    ({ stdout }) => stdout.trim(),
    () => "",
  );

  if (!initdbPath || !pgCtlPath || !psqlPath || !createdbPath || !dropdbPath) {
    return null;
  }

  const candidateDir = path.dirname(initdbPath);
  const postgresPath = path.join(candidateDir, "postgres");
  if (!fs.existsSync(postgresPath)) {
    return null;
  }

  return {
    initdb: initdbPath,
    pgCtl: pgCtlPath,
    psql: psqlPath,
    createdb: createdbPath,
    dropdb: dropdbPath,
    postgres: postgresPath,
  };
}

async function supportsReflink(): Promise<boolean> {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "trace-dbctl-reflink-"));
  const sourcePath = path.join(tempRoot, "source.txt");
  const targetPath = path.join(tempRoot, "target.txt");
  fs.writeFileSync(sourcePath, "trace-dbctl");
  try {
    if (process.platform === "darwin") {
      await execFileAsync("cp", ["-c", sourcePath, targetPath]);
    } else {
      await execFileAsync("cp", ["--reflink=always", sourcePath, targetPath]);
    }
    return fs.existsSync(targetPath);
  } catch {
    return false;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function waitForPostgresReady(psqlPath: string, port: number, databaseName: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    try {
      await execFileAsync(psqlPath, ["-h", "127.0.0.1", "-p", String(port), "-d", databaseName, "-c", "select 1"]);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Postgres did not become ready on port ${port}`);
}

function createEnv(databaseName: string, port: number): Record<string, string> {
  const url = `postgresql://127.0.0.1:${port}/${databaseName}`;
  return {
    DATABASE_URL: url,
    PGHOST: "127.0.0.1",
    PGPORT: String(port),
    PGDATABASE: databaseName,
    PGUSER: process.env.USER ?? "postgres",
  };
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
): Promise<void> {
  await execFileAsync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function cloneDirectory(sourceDir: string, targetDir: string): Promise<void> {
  ensureDir(path.dirname(targetDir));
  fs.rmSync(targetDir, { recursive: true, force: true });
  ensureDir(targetDir);

  if (process.platform === "darwin") {
    await execFileAsync("cp", ["-cR", `${sourceDir}/.`, targetDir]);
    return;
  }

  await execFileAsync("cp", ["-a", "--reflink=always", `${sourceDir}/.`, targetDir]);
}

async function startCluster(
  pgCtlPath: string,
  dataDir: string,
  port: number,
  logPath: string,
): Promise<void> {
  await execFileAsync(pgCtlPath, [
    "-D",
    dataDir,
    "-l",
    logPath,
    "-o",
    `-p ${port} -c max_connections=20 -c shared_buffers=32MB`,
    "-w",
    "start",
  ]);
}

async function stopCluster(pgCtlPath: string, dataDir: string): Promise<void> {
  await execFileAsync(pgCtlPath, ["-D", dataDir, "-w", "stop", "-m", "fast"]).catch(() => undefined);
}

async function buildBaseIfNeeded(args: {
  rootDir: string;
  runtime: DbctlRuntimeKind;
  repoKey: string;
  buildHash: string;
  worktreePath: string;
  framework: string;
  databaseName: string;
  instancePort: number;
  lastErrorPath: string;
}): Promise<{ ok: true; baseDataDir: string } | { ok: false; error: string }> {
  const repoRoot = path.join(args.rootDir, "repos", args.repoKey);
  const baseRoot = path.join(repoRoot, "bases", args.buildHash);
  const baseDataDir = path.join(baseRoot, "data");
  const manifestPath = path.join(baseRoot, "manifest.json");
  return withLock(path.join(baseRoot, ".lock"), async () => {
    if (fs.existsSync(manifestPath) && fs.existsSync(baseDataDir)) {
      return { ok: true, baseDataDir };
    }

    if (args.runtime !== "local") {
      const error = "Cloud dbctl backend is not configured yet";
      writeJson(args.lastErrorPath, { error, updatedAt: new Date().toISOString() });
      return { ok: false, error };
    }

    const binaries = await resolvePostgresBinaries();
    if (!binaries) {
      const error = "Postgres server binaries not found; install full PostgreSQL or set TRACE_DBCTL_PG_BIN_DIR";
      writeJson(args.lastErrorPath, { error, updatedAt: new Date().toISOString() });
      return { ok: false, error };
    }

    const reflink = await supportsReflink();
    if (!reflink) {
      const error = "Filesystem reflinks are unavailable; managed worktree databases require APFS or reflink-capable storage";
      writeJson(args.lastErrorPath, { error, updatedAt: new Date().toISOString() });
      return { ok: false, error };
    }

    const tempRoot = path.join(
      repoRoot,
      "bases",
      `${args.buildHash}.tmp-${process.pid}-${Date.now()}`,
    );
    const tempDataDir = path.join(tempRoot, "data");
    const tempLogPath = path.join(tempRoot, "postgres.log");
    ensureDir(tempRoot);

    try {
      await execFileAsync(binaries.initdb, ["-D", tempDataDir]);
      await startCluster(binaries.pgCtl, tempDataDir, args.instancePort, tempLogPath);
      await execFileAsync(binaries.createdb, [
        "-h",
        "127.0.0.1",
        "-p",
        String(args.instancePort),
        args.databaseName,
      ]);
      await waitForPostgresReady(binaries.psql, args.instancePort, args.databaseName);

      const detected = detectDatabaseProject(args.worktreePath);
      if (!detected || !detected.supported || !detected.migrationCommand) {
        throw new Error("No supported database project configuration found while building the base");
      }

      const env = createEnv(args.databaseName, args.instancePort);
      await runCommand(
        detected.migrationCommand.command,
        detected.migrationCommand.args,
        args.worktreePath,
        env,
      );
      if (detected.seedCommand) {
        await runCommand(
          detected.seedCommand.command,
          detected.seedCommand.args,
          args.worktreePath,
          env,
        );
      }
      await stopCluster(binaries.pgCtl, tempDataDir);

      fs.rmSync(baseRoot, { recursive: true, force: true });
      ensureDir(path.dirname(baseRoot));
      fs.renameSync(tempRoot, baseRoot);
      writeJson(manifestPath, {
        repoKey: args.repoKey,
        buildHash: args.buildHash,
        framework: args.framework,
        databaseName: args.databaseName,
        updatedAt: new Date().toISOString(),
      });
      return { ok: true, baseDataDir };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeJson(args.lastErrorPath, { error: message, updatedAt: new Date().toISOString() });
      await stopCluster(binaries.pgCtl, tempDataDir);
      fs.rmSync(tempRoot, { recursive: true, force: true });
      return { ok: false, error: message };
    }
  });
}

export class DbctlService {
  constructor(private readonly options: DbctlServiceOptions) {}

  private get rootDir(): string {
    return this.options.rootDir;
  }

  private getInstanceRoot(worktreeHash: string): string {
    return path.join(this.rootDir, "instances", worktreeHash);
  }

  private getInstanceManifestPath(worktreeHash: string): string {
    return path.join(this.getInstanceRoot(worktreeHash), "manifest.json");
  }

  private getInstanceLogPath(worktreeHash: string): string {
    return path.join(this.getInstanceRoot(worktreeHash), "postgres.log");
  }

  private async ensureDatabase(
    runtime: DbctlRuntimeKind,
    worktreePath: string,
    repoId?: string,
  ): Promise<DbctlResponse> {
    const resolvedWorktree = path.resolve(worktreePath);
    const worktreeHash = sha(resolvedWorktree).slice(0, 16);
    const detected = detectDatabaseProject(resolvedWorktree);

    if (!detected) {
      return {
        ok: true,
        database: createDatabaseInfo("disabled", { enabled: false, canReset: false }),
      };
    }

    if (!detected.supported) {
      return {
        ok: true,
        database: createDatabaseInfo("failed", {
          framework: detected.framework,
          lastError: detected.reason ?? "Database project detected but unsupported",
          canReset: false,
        }),
      };
    }

    const repoKey = repoId ?? sha(detected.projectRoot).slice(0, 16);
    const migrationHash = hashProjectInputs(detected.projectRoot, detected.fingerprintPaths);
    const baselineSeedHash = hashProjectInputs(detected.projectRoot, detected.baselineSeedPaths);
    const buildHash = sha(
      JSON.stringify({
        repoKey,
        framework: detected.framework,
        postgresVersion: detected.postgresVersion,
        migrationHash,
        baselineSeedHash,
        runtime,
      }),
    ).slice(0, 16);

    const instanceRoot = this.getInstanceRoot(worktreeHash);
    const manifestPath = this.getInstanceManifestPath(worktreeHash);
    const logPath = this.getInstanceLogPath(worktreeHash);
    ensureDir(instanceRoot);

    const existing = readJson<InstanceManifest>(manifestPath);
    const port = existing?.port ?? allocatePort(this.rootDir);
    const databaseName = existing?.databaseName ?? "trace_template";
    const buildResult = await buildBaseIfNeeded({
      rootDir: this.rootDir,
      runtime,
      repoKey,
      buildHash,
      worktreePath: detected.projectRoot,
      framework: detected.framework ?? "unknown",
      databaseName,
      instancePort: port,
      lastErrorPath: path.join(instanceRoot, "last-error.json"),
    });

    if (!buildResult.ok) {
      const database = createDatabaseInfo("failed", {
        framework: detected.framework,
        databaseName,
        port,
        lastError: buildResult.error,
      });
      writeJson(manifestPath, {
        worktreePath: resolvedWorktree,
        repoId: repoId ?? null,
        repoKey,
        worktreeHash,
        buildHash,
        framework: detected.framework,
        databaseName,
        port,
        lastError: buildResult.error,
        updatedAt: new Date().toISOString(),
      } satisfies InstanceManifest);
      return { ok: true, database };
    }

    if (!existing || existing.buildHash !== buildHash) {
      if (runtime !== "local") {
        const database = createDatabaseInfo("failed", {
          framework: detected.framework,
          databaseName,
          port,
          lastError: "Cloud dbctl backend is not configured yet",
        });
        writeJson(manifestPath, {
          worktreePath: resolvedWorktree,
          repoId: repoId ?? null,
          repoKey,
          worktreeHash,
          buildHash,
          framework: detected.framework,
          databaseName,
          port,
          lastError: database.lastError ?? null,
          updatedAt: new Date().toISOString(),
        } satisfies InstanceManifest);
        return { ok: true, database };
      }

      const binaries = await resolvePostgresBinaries();
      if (!binaries) {
        return {
          ok: true,
          database: createDatabaseInfo("failed", {
            framework: detected.framework,
            databaseName,
            port,
            lastError: "Postgres server binaries not found; install full PostgreSQL or set TRACE_DBCTL_PG_BIN_DIR",
          }),
        };
      }

      const instanceDataDir = path.join(instanceRoot, "data");
      const baseDataDir = buildResult.baseDataDir;
      try {
        await stopCluster(binaries.pgCtl, instanceDataDir);
        await cloneDirectory(baseDataDir, instanceDataDir);
        await startCluster(binaries.pgCtl, instanceDataDir, port, logPath);
        await waitForPostgresReady(binaries.psql, port, databaseName);
        writeJson(manifestPath, {
          worktreePath: resolvedWorktree,
          repoId: repoId ?? null,
          repoKey,
          worktreeHash,
          buildHash,
          framework: detected.framework,
          databaseName,
          port,
          lastError: null,
          updatedAt: new Date().toISOString(),
        } satisfies InstanceManifest);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeJson(manifestPath, {
          worktreePath: resolvedWorktree,
          repoId: repoId ?? null,
          repoKey,
          worktreeHash,
          buildHash,
          framework: detected.framework,
          databaseName,
          port,
          lastError: message,
          updatedAt: new Date().toISOString(),
        } satisfies InstanceManifest);
        return {
          ok: true,
          database: createDatabaseInfo("failed", {
            framework: detected.framework,
            databaseName,
            port,
            lastError: message,
          }),
        };
      }
    }

    return {
      ok: true,
      database: createDatabaseInfo("ready", {
        framework: detected.framework,
        databaseName,
        port,
        lastError: null,
      }),
      env: createEnv(databaseName, port),
      instanceId: worktreeHash,
    };
  }

  private async resetDatabase(
    runtime: DbctlRuntimeKind,
    worktreePath: string,
    repoId?: string,
  ): Promise<DbctlResponse> {
    const worktreeHash = sha(path.resolve(worktreePath)).slice(0, 16);
    fs.rmSync(this.getInstanceRoot(worktreeHash), { recursive: true, force: true });
    return this.ensureDatabase(runtime, worktreePath, repoId);
  }

  async handle(request: DbctlRequest): Promise<DbctlResponse> {
    switch (request.kind) {
      case "ensure":
        return this.ensureDatabase(request.runtime, request.worktreePath, request.repoId);
      case "reset":
        return this.resetDatabase(request.runtime, request.worktreePath, request.repoId);
      case "destroy": {
        const worktreeHash = sha(path.resolve(request.worktreePath)).slice(0, 16);
        fs.rmSync(this.getInstanceRoot(worktreeHash), { recursive: true, force: true });
        return {
          ok: true,
          database: createDatabaseInfo("disabled", {
            enabled: false,
            canReset: false,
          }),
        };
      }
      case "logs": {
        const worktreeHash = sha(path.resolve(request.worktreePath)).slice(0, 16);
        const manifest = readJson<InstanceManifest>(this.getInstanceManifestPath(worktreeHash));
        return {
          ok: true,
          database: manifest
            ? createDatabaseInfo(manifest.lastError ? "failed" : "ready", {
                framework: manifest.framework as SessionDatabaseInfo["framework"],
                databaseName: manifest.databaseName,
                port: manifest.port,
                lastError: manifest.lastError,
              })
            : createDatabaseInfo("disabled", { enabled: false, canReset: false }),
          logs: tailFile(this.getInstanceLogPath(worktreeHash), request.lines ?? 200),
        };
      }
      case "status": {
        const worktreeHash = sha(path.resolve(request.worktreePath)).slice(0, 16);
        const manifest = readJson<InstanceManifest>(this.getInstanceManifestPath(worktreeHash));
        if (!manifest) {
          return {
            ok: true,
            database: createDatabaseInfo("disabled", { enabled: false, canReset: false }),
          };
        }
        return {
          ok: true,
          database: createDatabaseInfo(manifest.lastError ? "failed" : "ready", {
            framework: manifest.framework as SessionDatabaseInfo["framework"],
            databaseName: manifest.databaseName,
            port: manifest.port,
            lastError: manifest.lastError,
          }),
          env: manifest.port && manifest.databaseName ? createEnv(manifest.databaseName, manifest.port) : undefined,
          instanceId: manifest.worktreeHash,
        };
      }
      case "gc": {
        const instancesRoot = path.join(this.rootDir, "instances");
        if (fs.existsSync(instancesRoot)) {
          for (const entry of fs.readdirSync(instancesRoot, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const manifest = readJson<InstanceManifest>(path.join(instancesRoot, entry.name, "manifest.json"));
            if (manifest && !fs.existsSync(manifest.worktreePath)) {
              fs.rmSync(path.join(instancesRoot, entry.name), { recursive: true, force: true });
            }
          }
        }
        return {
          ok: true,
          database: createDatabaseInfo("disabled", { enabled: false, canReset: false }),
        };
      }
      case "psql":
        return {
          ok: false,
          error: "Interactive psql launching is handled by the CLI/runtime, not the daemon response API",
        };
      default:
        return {
          ok: false,
          error: `Unsupported dbctl request: ${(request as { kind?: string }).kind ?? "unknown"}`,
        };
    }
  }
}
