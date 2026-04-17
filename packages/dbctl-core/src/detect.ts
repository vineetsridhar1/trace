import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import type {
  DbctlFramework,
} from "@trace/dbctl-protocol";

const WALK_IGNORE = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "__pycache__",
  ".venv",
  "vendor/bundle",
]);

export interface ResolvedCommand {
  command: string;
  args: string[];
}

export interface DetectedDatabaseProject {
  supported: boolean;
  framework: DbctlFramework | null;
  projectRoot: string;
  reason?: string;
  migrationCommand: ResolvedCommand | null;
  seedCommand: ResolvedCommand | null;
  fingerprintPaths: string[];
  baselineSeedPaths: string[];
  postgresVersion: string;
}

type PackageManifest = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  prisma?: { seed?: string };
};

function fileExists(targetPath: string): boolean {
  try {
    fs.accessSync(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function readText(targetPath: string): string | null {
  try {
    return fs.readFileSync(targetPath, "utf-8");
  } catch {
    return null;
  }
}

function readJson<T>(targetPath: string): T | null {
  const text = readText(targetPath);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function findFirstExisting(root: string, relativePaths: string[]): string | null {
  for (const relativePath of relativePaths) {
    const fullPath = path.join(root, relativePath);
    if (fileExists(fullPath)) return fullPath;
  }
  return null;
}

function listFilesRecursively(root: string, targetPath: string, acc: string[]): void {
  if (!fileExists(targetPath)) return;
  const stats = fs.statSync(targetPath);
  if (stats.isFile()) {
    acc.push(path.relative(root, targetPath));
    return;
  }
  if (!stats.isDirectory()) return;

  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name);
    const relative = path.relative(root, fullPath);
    if ([...WALK_IGNORE].some((ignored) => relative === ignored || relative.startsWith(`${ignored}${path.sep}`))) {
      continue;
    }
    if (entry.isDirectory()) {
      listFilesRecursively(root, fullPath, acc);
    } else if (entry.isFile()) {
      acc.push(relative);
    }
  }
}

function listMatchingFiles(root: string, relativePaths: string[]): string[] {
  const acc: string[] = [];
  for (const relativePath of relativePaths) {
    const fullPath = path.join(root, relativePath);
    listFilesRecursively(root, fullPath, acc);
  }
  return [...new Set(acc)].sort();
}

function readPostgresVersion(root: string): string {
  const text = readText(path.join(root, ".db-version"));
  return text?.trim() || "system";
}

function pickJsPackageManager(root: string): "pnpm" | "npm" | "yarn" | "bun" {
  if (fileExists(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fileExists(path.join(root, "package-lock.json"))) return "npm";
  if (fileExists(path.join(root, "yarn.lock"))) return "yarn";
  if (fileExists(path.join(root, "bun.lockb")) || fileExists(path.join(root, "bun.lock"))) {
    return "bun";
  }
  return "npm";
}

function createJsRunCommand(root: string, scriptName: string): ResolvedCommand {
  const manager = pickJsPackageManager(root);
  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: ["run", scriptName] };
    case "yarn":
      return { command: "yarn", args: [scriptName] };
    case "bun":
      return { command: "bun", args: ["run", scriptName] };
    default:
      return { command: "npm", args: ["run", scriptName] };
  }
}

function createJsExecCommand(root: string, args: string[]): ResolvedCommand {
  const manager = pickJsPackageManager(root);
  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: ["exec", ...args] };
    case "yarn":
      return { command: "yarn", args: ["exec", ...args] };
    case "bun":
      return { command: "bun", args: ["x", ...args] };
    default:
      return { command: "npx", args };
  }
}

function createPythonCommand(root: string, args: string[]): ResolvedCommand {
  if (fileExists(path.join(root, "uv.lock"))) {
    return { command: "uv", args: ["run", ...args] };
  }
  if (fileExists(path.join(root, "poetry.lock"))) {
    return { command: "poetry", args: ["run", ...args] };
  }
  if (fileExists(path.join(root, ".venv", "bin", "python"))) {
    return { command: path.join(root, ".venv", "bin", "python"), args };
  }
  return { command: "python3", args };
}

function createRubyCommand(args: string[]): ResolvedCommand {
  return { command: "bundle", args: ["exec", ...args] };
}

function createJavaCommand(root: string, gradleTask: string, mavenGoal: string): ResolvedCommand | null {
  if (fileExists(path.join(root, "gradlew"))) {
    return { command: "./gradlew", args: [gradleTask] };
  }
  if (fileExists(path.join(root, "mvnw"))) {
    return { command: "./mvnw", args: [mavenGoal] };
  }
  if (fileExists(path.join(root, "build.gradle")) || fileExists(path.join(root, "build.gradle.kts"))) {
    return { command: "gradle", args: [gradleTask] };
  }
  if (fileExists(path.join(root, "pom.xml"))) {
    return { command: "mvn", args: [mavenGoal] };
  }
  return null;
}

function createDotnetEfCommand(root: string, projectFile: string): ResolvedCommand {
  return {
    command: "dotnet",
    args: ["ef", "database", "update", "--project", path.relative(root, projectFile)],
  };
}

function selectScript(
  manifest: PackageManifest | null,
  names: string[],
): string | null {
  for (const name of names) {
    if (manifest?.scripts?.[name]) return name;
  }
  return null;
}

function hasDependency(manifest: PackageManifest | null, name: string): boolean {
  return Boolean(manifest?.dependencies?.[name] || manifest?.devDependencies?.[name]);
}

function detectPrisma(root: string, manifest: PackageManifest | null): DetectedDatabaseProject | null {
  const schemaPath = path.join(root, "prisma", "schema.prisma");
  const schema = readText(schemaPath);
  if (!schema || !/provider\s*=\s*"postgresql"/.test(schema)) return null;

  const migrateScript = selectScript(manifest, ["db:migrate", "migrate"]);
  const seedScript = selectScript(manifest, ["db:seed", "seed:db", "seed"]);
  const migrationCommand = migrateScript
    ? createJsRunCommand(root, migrateScript)
    : createJsExecCommand(root, ["prisma", "migrate", "deploy"]);
  const seedCommand = seedScript
    ? createJsRunCommand(root, seedScript)
    : manifest?.prisma?.seed
      ? createJsExecCommand(root, ["prisma", "db", "seed"])
      : null;

  return {
    supported: true,
    framework: "prisma",
    projectRoot: root,
    migrationCommand,
    seedCommand,
    fingerprintPaths: listMatchingFiles(root, ["package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb", "prisma/schema.prisma", "prisma/migrations"]),
    baselineSeedPaths: listMatchingFiles(root, ["package.json", "prisma/seed.ts", "prisma/seed.js", "prisma/seed.mjs", "prisma/seed.cjs"]),
    postgresVersion: readPostgresVersion(root),
  };
}

function detectDrizzle(root: string, manifest: PackageManifest | null): DetectedDatabaseProject | null {
  const configPath = findFirstExisting(root, [
    "drizzle.config.ts",
    "drizzle.config.js",
    "drizzle.config.mts",
    "drizzle.config.cts",
  ]);
  if (!configPath) return null;

  const migrateScript = selectScript(manifest, ["db:migrate", "migrate"]);
  const seedScript = selectScript(manifest, ["db:seed", "seed:db", "seed"]);

  return {
    supported: true,
    framework: "drizzle",
    projectRoot: root,
    migrationCommand: migrateScript
      ? createJsRunCommand(root, migrateScript)
      : createJsExecCommand(root, ["drizzle-kit", "migrate"]),
    seedCommand: seedScript ? createJsRunCommand(root, seedScript) : null,
    fingerprintPaths: listMatchingFiles(root, [
      path.relative(root, configPath),
      "drizzle",
      "package.json",
      "pnpm-lock.yaml",
      "package-lock.json",
      "yarn.lock",
      "bun.lock",
      "bun.lockb",
    ]),
    baselineSeedPaths: listMatchingFiles(root, ["package.json", "scripts", "db/seed"]),
    postgresVersion: readPostgresVersion(root),
  };
}

function detectSequelize(root: string, manifest: PackageManifest | null): DetectedDatabaseProject | null {
  const hasSequelize =
    hasDependency(manifest, "sequelize") || hasDependency(manifest, "sequelize-cli");
  const configPath = findFirstExisting(root, [
    ".sequelizerc",
    "config/config.js",
    "config/config.cjs",
    "config/config.ts",
    "config/config.json",
  ]);
  if (!hasSequelize && !configPath) return null;

  const configText = configPath ? readText(configPath) ?? "" : JSON.stringify(manifest ?? {});
  if (!/postgres|postgresql|pg/.test(configText) && !hasDependency(manifest, "pg")) {
    return null;
  }

  const migrateScript = selectScript(manifest, ["db:migrate", "migrate"]);
  const seedScript = selectScript(manifest, ["db:seed", "seed:db", "seed"]);

  return {
    supported: true,
    framework: "sequelize",
    projectRoot: root,
    migrationCommand: migrateScript
      ? createJsRunCommand(root, migrateScript)
      : createJsExecCommand(root, ["sequelize-cli", "db:migrate"]),
    seedCommand: seedScript
      ? createJsRunCommand(root, seedScript)
      : fileExists(path.join(root, "seeders"))
        ? createJsExecCommand(root, ["sequelize-cli", "db:seed:all"])
        : null,
    fingerprintPaths: listMatchingFiles(root, [
      "package.json",
      "pnpm-lock.yaml",
      "package-lock.json",
      "yarn.lock",
      "bun.lock",
      "bun.lockb",
      "migrations",
      "config",
      ".sequelizerc",
    ]),
    baselineSeedPaths: listMatchingFiles(root, ["package.json", "seeders"]),
    postgresVersion: readPostgresVersion(root),
  };
}

function detectRails(root: string): DetectedDatabaseProject | null {
  const databaseConfigPath = path.join(root, "config", "database.yml");
  if (!fileExists(path.join(root, "bin", "rails")) || !fileExists(databaseConfigPath)) return null;
  const config = readText(databaseConfigPath);
  if (!config || !/postgresql/.test(config)) return null;

  return {
    supported: true,
    framework: "active_record",
    projectRoot: root,
    migrationCommand: createRubyCommand(["bin/rails", "db:prepare"]),
    seedCommand: fileExists(path.join(root, "db", "seeds.rb"))
      ? createRubyCommand(["bin/rails", "db:seed"])
      : null,
    fingerprintPaths: listMatchingFiles(root, ["Gemfile", "Gemfile.lock", "db/migrate", "config/database.yml"]),
    baselineSeedPaths: listMatchingFiles(root, ["db/seeds.rb", "db/seeds"]),
    postgresVersion: readPostgresVersion(root),
  };
}

function detectDjango(root: string): DetectedDatabaseProject | null {
  const managePath = path.join(root, "manage.py");
  if (!fileExists(managePath)) return null;

  const pythonFiles = listMatchingFiles(root, ["."]);
  const settingsPath = pythonFiles.find((relativePath) => /settings(\.base)?\.py$/.test(relativePath));
  if (!settingsPath) return null;
  const settingsText = readText(path.join(root, settingsPath));
  if (!settingsText || !/django\.db\.backends\.postgresql/.test(settingsText)) return null;

  const defaultFixture = findFirstExisting(root, [
    "fixtures/initial_data.json",
    "fixtures/default.json",
    "db/fixtures/default.json",
  ]);

  return {
    supported: true,
    framework: "django",
    projectRoot: root,
    migrationCommand: createPythonCommand(root, ["manage.py", "migrate"]),
    seedCommand: defaultFixture
      ? createPythonCommand(root, ["manage.py", "loaddata", path.relative(root, defaultFixture)])
      : null,
    fingerprintPaths: listMatchingFiles(root, ["manage.py", path.dirname(settingsPath), "migrations"]),
    baselineSeedPaths: defaultFixture ? [path.relative(root, defaultFixture)] : [],
    postgresVersion: readPostgresVersion(root),
  };
}

function detectSqlAlchemy(root: string): DetectedDatabaseProject | null {
  const alembicIni = path.join(root, "alembic.ini");
  const pyproject = readText(path.join(root, "pyproject.toml")) ?? "";
  const requirements = readText(path.join(root, "requirements.txt")) ?? "";
  const hasSqlalchemy = /sqlalchemy/i.test(pyproject) || /sqlalchemy/i.test(requirements);
  if (!fileExists(alembicIni) && !hasSqlalchemy) return null;
  if (!fileExists(alembicIni)) {
    return {
      supported: false,
      framework: "sqlalchemy",
      projectRoot: root,
      reason: "SQLAlchemy detected without Alembic migrations",
      migrationCommand: null,
      seedCommand: null,
      fingerprintPaths: listMatchingFiles(root, ["pyproject.toml", "requirements.txt"]),
      baselineSeedPaths: [],
      postgresVersion: readPostgresVersion(root),
    };
  }

  const defaultSeed = findFirstExisting(root, ["scripts/seed.py", "seed.py"]);
  return {
    supported: true,
    framework: "sqlalchemy",
    projectRoot: root,
    migrationCommand: createPythonCommand(root, ["-m", "alembic", "upgrade", "head"]),
    seedCommand: defaultSeed ? createPythonCommand(root, [path.relative(root, defaultSeed)]) : null,
    fingerprintPaths: listMatchingFiles(root, ["alembic.ini", "alembic", "pyproject.toml", "requirements.txt"]),
    baselineSeedPaths: defaultSeed ? [path.relative(root, defaultSeed)] : [],
    postgresVersion: readPostgresVersion(root),
  };
}

function findCsprojFiles(root: string): string[] {
  return listMatchingFiles(root, ["."]).filter((relativePath) => relativePath.endsWith(".csproj"));
}

function detectEntityFramework(root: string): DetectedDatabaseProject | null {
  const projectFiles = findCsprojFiles(root);
  if (projectFiles.length === 0) return null;
  const projectFile = projectFiles.find((relativePath) => {
    const content = readText(path.join(root, relativePath)) ?? "";
    return /Microsoft\.EntityFrameworkCore/.test(content) && /Npgsql\.EntityFrameworkCore\.PostgreSQL/.test(content);
  });
  if (!projectFile) return null;

  return {
    supported: true,
    framework: "entity_framework_core",
    projectRoot: root,
    migrationCommand: createDotnetEfCommand(root, path.join(root, projectFile)),
    seedCommand: null,
    fingerprintPaths: listMatchingFiles(root, [projectFile, "Migrations"]),
    baselineSeedPaths: [],
    postgresVersion: readPostgresVersion(root),
  };
}

function detectHibernate(root: string): DetectedDatabaseProject | null {
  const pomText = readText(path.join(root, "pom.xml")) ?? "";
  const gradleText =
    readText(path.join(root, "build.gradle")) ??
    readText(path.join(root, "build.gradle.kts")) ??
    "";
  const hasHibernate =
    /hibernate-core|spring-boot-starter-data-jpa/.test(pomText) ||
    /hibernate-core|spring-boot-starter-data-jpa/.test(gradleText);
  if (!hasHibernate) return null;

  const hasPostgres = /postgresql|org\.postgresql/.test(pomText) || /postgresql/.test(gradleText);
  if (!hasPostgres) return null;

  const flyway = createJavaCommand(root, "flywayMigrate", "flyway:migrate");
  const liquibase = createJavaCommand(root, "update", "liquibase:update");
  const migrationCommand = flyway ?? liquibase;
  if (!migrationCommand) {
    return {
      supported: false,
      framework: "hibernate",
      projectRoot: root,
      reason: "Hibernate detected without Flyway, Liquibase, or an explicit bootstrap command",
      migrationCommand: null,
      seedCommand: null,
      fingerprintPaths: listMatchingFiles(root, ["pom.xml", "build.gradle", "build.gradle.kts", "src/main/resources"]),
      baselineSeedPaths: [],
      postgresVersion: readPostgresVersion(root),
    };
  }

  return {
    supported: true,
    framework: "hibernate",
    projectRoot: root,
    migrationCommand,
    seedCommand: null,
    fingerprintPaths: listMatchingFiles(root, ["pom.xml", "build.gradle", "build.gradle.kts", "src/main/resources", "src/main/java"]),
    baselineSeedPaths: [],
    postgresVersion: readPostgresVersion(root),
  };
}

export function detectDatabaseProject(worktreePath: string): DetectedDatabaseProject | null {
  const root = path.resolve(worktreePath);
  const manifest = readJson<PackageManifest>(path.join(root, "package.json"));

  return (
    detectPrisma(root, manifest) ??
    detectDrizzle(root, manifest) ??
    detectSequelize(root, manifest) ??
    detectRails(root) ??
    detectDjango(root) ??
    detectSqlAlchemy(root) ??
    detectEntityFramework(root) ??
    detectHibernate(root)
  );
}

export function hashProjectInputs(root: string, relativePaths: string[]): string {
  const hash = createHash("sha256");
  for (const relativePath of [...new Set(relativePaths)].sort()) {
    const fullPath = path.join(root, relativePath);
    if (!fileExists(fullPath)) continue;
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) continue;
    hash.update(relativePath);
    hash.update("\n");
    hash.update(fs.readFileSync(fullPath));
    hash.update("\n");
  }
  return hash.digest("hex");
}
