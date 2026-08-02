import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { access, chmod, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

type RuntimeSecrets = {
  databasePassword: string;
  jwtSecret: string;
  tokenEncryptionKey: string;
};

type LocalRuntimeOptions = {
  appDataPath: string;
  packaged: boolean;
  resourcesPath: string;
  electronPath: string;
  developmentRoot: string;
};

type PostgresBinaryPaths = {
  initdb: string;
  postgres: string;
  psql: string;
};

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a loopback port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    sleep(timeoutMs).then(() => undefined),
  ]);
}

async function runProcess(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  label: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-16_000);
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${label} failed (${code ?? signal ?? "unknown"})${stderr ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

async function runProcessWithOutput(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  label: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-16_000);
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(
          `${label} failed (${code ?? signal ?? "unknown"})${stderr ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export class LocalRuntime {
  private readonly stateRoot: string;
  private readonly databaseDir: string;
  private readonly storageDir: string;
  private readonly secretsPath: string;
  private postgresProcess: ChildProcess | null = null;
  private serverProcess: ChildProcess | null = null;
  private starting: Promise<string> | null = null;
  private webUrl: string | null = null;

  constructor(private readonly options: LocalRuntimeOptions) {
    this.stateRoot = path.join(options.appDataPath, "local-runtime");
    this.databaseDir = path.join(this.stateRoot, "postgres");
    this.storageDir = path.join(this.stateRoot, "storage");
    this.secretsPath = path.join(this.stateRoot, "secrets.json");
  }

  start(): Promise<string> {
    if (this.webUrl) return Promise.resolve(this.webUrl);
    if (this.starting) return this.starting;
    this.starting = this.startInternal()
      .catch(async (error: unknown) => {
        await this.stop();
        throw error;
      })
      .finally(() => {
        this.starting = null;
      });
    return this.starting;
  }

  async stop(): Promise<void> {
    this.webUrl = null;
    if (this.serverProcess) {
      const child = this.serverProcess;
      this.serverProcess = null;
      child.kill("SIGTERM");
      await waitForExit(child, 5_000);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    if (this.postgresProcess) {
      const child = this.postgresProcess;
      this.postgresProcess = null;
      child.kill("SIGTERM");
      await waitForExit(child, 10_000);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }

  private async startInternal(): Promise<string> {
    await mkdir(this.storageDir, { recursive: true });
    const secrets = await this.loadSecrets();
    const databasePort = await reservePort();
    const serverPort = await reservePort();
    const binaries = this.resolvePostgresBinaries();

    if (!(await pathExists(path.join(this.databaseDir, "PG_VERSION")))) {
      await this.initializePostgres(binaries, secrets.databasePassword);
    }
    await this.startPostgres(binaries, databasePort);

    const databaseUrl = `postgresql://postgres:${encodeURIComponent(
      secrets.databasePassword,
    )}@127.0.0.1:${databasePort}/postgres?sslmode=disable`;
    const webUrl = `http://127.0.0.1:${serverPort}`;
    const serverRoot = this.options.packaged
      ? path.join(this.options.resourcesPath, "local-server")
      : path.join(this.options.developmentRoot, "apps", "server");
    const webRoot = this.options.packaged
      ? path.join(this.options.resourcesPath, "local-web")
      : path.join(this.options.developmentRoot, "apps", "web", "dist");
    const serverEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(serverPort),
      TRACE_SERVER_HOST: "127.0.0.1",
      DATABASE_URL: databaseUrl,
      TRACE_LOCAL_MODE: "1",
      JWT_SECRET: secrets.jwtSecret,
      TOKEN_ENCRYPTION_KEY: secrets.tokenEncryptionKey,
      TRACE_SERVER_PUBLIC_URL: webUrl,
      TRACE_SERVER_URL: webUrl,
      TRACE_WEB_URL: webUrl,
      CORS_ALLOWED_ORIGINS: webUrl,
      STORAGE_MODE: "local",
      LOCAL_STORAGE_DIR: path.join(this.storageDir, "uploads"),
      GIT_STORAGE_ROOT: path.join(this.storageDir, "git"),
      STORAGE_PUBLIC_URL: webUrl,
      TRACE_WEB_DIST_DIR: webRoot,
    };

    await this.runMigrations(serverRoot, serverEnv, binaries);
    await this.startServer(serverRoot, serverEnv, webUrl);
    this.webUrl = webUrl;
    return webUrl;
  }

  private async loadSecrets(): Promise<RuntimeSecrets> {
    await mkdir(this.stateRoot, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.secretsPath, "utf8")) as Partial<RuntimeSecrets>;
      if (parsed.databasePassword && parsed.jwtSecret && parsed.tokenEncryptionKey) {
        return parsed as RuntimeSecrets;
      }
    } catch {
      // A missing or invalid file is replaced with fresh local-only secrets.
    }

    const secrets: RuntimeSecrets = {
      databasePassword: randomHex(24),
      jwtSecret: randomHex(32),
      tokenEncryptionKey: randomHex(32),
    };
    await writeFile(this.secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
    return secrets;
  }

  private resolvePostgresBinaries(): PostgresBinaryPaths {
    const nativeRoot = this.options.packaged
      ? path.join(this.options.resourcesPath, "local-postgres")
      : path.join(this.options.developmentRoot, "out", "desktop-local-runtime", "local-postgres");
    const executable = (name: string) =>
      path.join(nativeRoot, "bin", process.platform === "win32" ? `${name}.exe` : name);
    return {
      initdb: executable("initdb"),
      postgres: executable("postgres"),
      psql: executable("psql"),
    };
  }

  private async initializePostgres(
    binaries: PostgresBinaryPaths,
    databasePassword: string,
  ): Promise<void> {
    await mkdir(this.databaseDir, { recursive: true });
    await chmod(binaries.initdb, 0o755);
    const passwordPath = path.join(this.stateRoot, "initdb-password");
    await writeFile(passwordPath, `${databasePassword}\n`, { mode: 0o600 });
    try {
      await runProcess(
        binaries.initdb,
        [
          `--pgdata=${this.databaseDir}`,
          "--auth=scram-sha-256",
          "--username=postgres",
          `--pwfile=${passwordPath}`,
          "--encoding=UTF8",
          "--locale=C",
        ],
        process.env,
        "PostgreSQL initialization",
      );
    } finally {
      await rm(passwordPath, { force: true });
    }
  }

  private async startPostgres(
    binaries: PostgresBinaryPaths,
    databasePort: number,
  ): Promise<void> {
    await chmod(binaries.postgres, 0o755);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        binaries.postgres,
        ["-D", this.databaseDir, "-p", String(databasePort), "-h", "127.0.0.1"],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      this.postgresProcess = child;
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("Timed out starting embedded PostgreSQL"));
        }
      }, 30_000);
      child.stderr?.on("data", (chunk: Buffer) => {
        const message = chunk.toString("utf8");
        if (!settled && message.includes("database system is ready to accept connections")) {
          settled = true;
          clearTimeout(timeout);
          resolve();
        }
      });
      child.once("error", (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      });
      child.once("exit", (code, signal) => {
        if (this.postgresProcess === child) this.postgresProcess = null;
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`Embedded PostgreSQL exited early (${code ?? signal ?? "unknown"})`));
        }
      });
    });
  }

  private async runMigrations(
    serverRoot: string,
    env: NodeJS.ProcessEnv,
    binaries: PostgresBinaryPaths,
  ): Promise<void> {
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) throw new Error("Local database URL is missing");
    await chmod(binaries.psql, 0o755);
    const psqlArgs = ["--dbname", databaseUrl, "--set", "ON_ERROR_STOP=1"];
    await runProcess(
      binaries.psql,
      [
        ...psqlArgs,
        "--command",
        'CREATE TABLE IF NOT EXISTS "_trace_local_migrations" ("name" TEXT PRIMARY KEY, "checksum" TEXT NOT NULL, "applied_at" TIMESTAMPTZ NOT NULL DEFAULT NOW())',
      ],
      env,
      "Local migration table setup",
    );

    const migrationsRoot = path.join(serverRoot, "prisma", "migrations");
    const entries = (await readdir(migrationsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const migrationPath = path.join(migrationsRoot, entry.name, "migration.sql");
      if (!(await pathExists(migrationPath))) continue;
      const migrationSql = await readFile(migrationPath);
      const checksum = createHash("sha256").update(migrationSql).digest("hex");
      const appliedChecksum = (
        await runProcessWithOutput(
          binaries.psql,
          [
            ...psqlArgs,
            "--tuples-only",
            "--no-align",
            "--command",
            `SELECT "checksum" FROM "_trace_local_migrations" WHERE "name" = ${sqlString(entry.name)}`,
          ],
          env,
          `Checking local migration ${entry.name}`,
        )
      ).trim();
      if (appliedChecksum) {
        if (appliedChecksum !== checksum) {
          throw new Error(`Local migration ${entry.name} changed after it was applied`);
        }
        continue;
      }
      await runProcess(
        binaries.psql,
        [
          ...psqlArgs,
          ...(!/^\s*(BEGIN|COMMIT);/im.test(migrationSql.toString("utf8"))
            ? ["--single-transaction"]
            : []),
          "--file",
          migrationPath,
          "--command",
          `INSERT INTO "_trace_local_migrations" ("name", "checksum") VALUES (${sqlString(entry.name)}, ${sqlString(checksum)})`,
        ],
        env,
        `Applying local migration ${entry.name}`,
      );
    }
  }

  private async startServer(
    serverRoot: string,
    env: NodeJS.ProcessEnv,
    webUrl: string,
  ): Promise<void> {
    const entrypoint = path.join(serverRoot, "dist", "index.js");
    const child = spawn(this.options.electronPath, [entrypoint], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.serverProcess = child;
    child.stdout?.on("data", (chunk: Buffer) => console.log(`[local-server] ${chunk}`));
    child.stderr?.on("data", (chunk: Buffer) => console.error(`[local-server] ${chunk}`));
    child.once("exit", () => {
      if (this.serverProcess === child) this.serverProcess = null;
    });

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error("Local Trace server exited during startup");
      }
      try {
        const response = await fetch(`${webUrl}/health`, { signal: AbortSignal.timeout(2_000) });
        const body = (await response.json()) as { ready?: boolean };
        if (response.ok && body.ready === true) return;
      } catch {
        // Retry until the server reports that startup is complete.
      }
      await sleep(300);
    }
    throw new Error("Timed out starting the local Trace server");
  }
}
