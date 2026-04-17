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
  cwd?: string;
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

const JS_LOCKFILES = [
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "pnpm-workspace.yaml",
] as const;
const MAKEFILE_NAMES = ["Makefile", "makefile", "GNUmakefile"] as const;
const MIGRATION_SCRIPT_NAMES = [
  "db:migrate",
  "migrate",
  "migrate:db",
  "database:migrate",
  "db:prepare",
] as const;
const SEED_SCRIPT_NAMES = [
  "db:seed",
  "seed:db",
  "seed",
  "database:seed",
] as const;
const MIGRATION_TARGET_NAMES = [
  "db-migrate",
  "db_migrate",
  "migrate-db",
  "migrate_db",
  "migrate",
  "db-prepare",
] as const;
const SEED_TARGET_NAMES = [
  "db-seed",
  "db_seed",
  "seed-db",
  "seed_db",
  "seed",
] as const;

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

function findFilesByName(root: string, fileNames: readonly string[]): string[] {
  const wanted = new Set(fileNames);
  const results: string[] = [];

  function walk(currentPath: string): void {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relative = path.relative(root, fullPath);
      if ([...WALK_IGNORE].some((ignored) => relative === ignored || relative.startsWith(`${ignored}${path.sep}`))) {
        continue;
      }
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && wanted.has(entry.name)) {
        results.push(relative);
      }
    }
  }

  walk(root);
  return results.sort((left, right) => {
    const depthDelta = left.split(path.sep).length - right.split(path.sep).length;
    return depthDelta === 0 ? left.localeCompare(right) : depthDelta;
  });
}

function findNearestAncestorFile(
  root: string,
  startDir: string,
  fileNames: readonly string[],
): string | null {
  let current = startDir;
  while (true) {
    for (const fileName of fileNames) {
      const candidate = path.join(current, fileName);
      if (fileExists(candidate)) {
        return candidate;
      }
    }
    if (current === root) return null;
    const parent = path.dirname(current);
    if (parent === current || !parent.startsWith(root)) return null;
    current = parent;
  }
}

function findNearestPackageRoot(root: string, startDir: string): string | null {
  const manifestPath = findNearestAncestorFile(root, startDir, ["package.json"]);
  return manifestPath ? path.dirname(manifestPath) : null;
}

function findAncestorLockfiles(root: string, startDir: string): string[] {
  const results: string[] = [];
  let current = startDir;
  while (true) {
    for (const fileName of JS_LOCKFILES) {
      const candidate = path.join(current, fileName);
      if (fileExists(candidate)) {
        results.push(path.relative(root, candidate));
      }
    }
    if (current === root) break;
    const parent = path.dirname(current);
    if (parent === current || !parent.startsWith(root)) break;
    current = parent;
  }
  return [...new Set(results)].sort();
}

function readMakeTargets(root: string): Set<string> {
  const makefilePath = findFirstExisting(root, [...MAKEFILE_NAMES]);
  if (!makefilePath) return new Set();
  const text = readText(makefilePath) ?? "";
  const targets = new Set<string>();
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*:/);
    if (!match) continue;
    if (match[1].includes("%")) continue;
    targets.add(match[1]);
  }
  return targets;
}

function selectMakeTarget(root: string, names: readonly string[]): string | null {
  const targets = readMakeTargets(root);
  for (const name of names) {
    if (targets.has(name)) return name;
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
  let current = root;
  while (true) {
    if (fileExists(path.join(current, "pnpm-lock.yaml"))) return "pnpm";
    if (fileExists(path.join(current, "package-lock.json"))) return "npm";
    if (fileExists(path.join(current, "yarn.lock"))) return "yarn";
    if (fileExists(path.join(current, "bun.lockb")) || fileExists(path.join(current, "bun.lock"))) {
      return "bun";
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return "npm";
}

function createJsRunCommand(root: string, scriptName: string): ResolvedCommand {
  const manager = pickJsPackageManager(root);
  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: ["run", scriptName], cwd: root };
    case "yarn":
      return { command: "yarn", args: [scriptName], cwd: root };
    case "bun":
      return { command: "bun", args: ["run", scriptName], cwd: root };
    default:
      return { command: "npm", args: ["run", scriptName], cwd: root };
  }
}

function createJsExecCommand(root: string, args: string[]): ResolvedCommand {
  const manager = pickJsPackageManager(root);
  switch (manager) {
    case "pnpm":
      return { command: "pnpm", args: ["exec", ...args], cwd: root };
    case "yarn":
      return { command: "yarn", args: ["exec", ...args], cwd: root };
    case "bun":
      return { command: "bun", args: ["x", ...args], cwd: root };
    default:
      return { command: "npx", args, cwd: root };
  }
}

function createPythonCommand(root: string, args: string[]): ResolvedCommand {
  if (fileExists(path.join(root, "uv.lock"))) {
    return { command: "uv", args: ["run", ...args], cwd: root };
  }
  if (fileExists(path.join(root, "poetry.lock"))) {
    return { command: "poetry", args: ["run", ...args], cwd: root };
  }
  if (fileExists(path.join(root, ".venv", "bin", "python"))) {
    return { command: path.join(root, ".venv", "bin", "python"), args, cwd: root };
  }
  return { command: "python3", args, cwd: root };
}

function createRubyCommand(args: string[]): ResolvedCommand {
  return { command: "bundle", args: ["exec", ...args] };
}

function createJavaCommand(root: string, gradleTask: string, mavenGoal: string): ResolvedCommand | null {
  if (fileExists(path.join(root, "gradlew"))) {
    return { command: "./gradlew", args: [gradleTask], cwd: root };
  }
  if (fileExists(path.join(root, "mvnw"))) {
    return { command: "./mvnw", args: [mavenGoal], cwd: root };
  }
  if (fileExists(path.join(root, "build.gradle")) || fileExists(path.join(root, "build.gradle.kts"))) {
    return { command: "gradle", args: [gradleTask], cwd: root };
  }
  if (fileExists(path.join(root, "pom.xml"))) {
    return { command: "mvn", args: [mavenGoal], cwd: root };
  }
  return null;
}

function createDotnetEfCommand(root: string, projectFile: string): ResolvedCommand {
  return {
    command: "dotnet",
    args: ["ef", "database", "update", "--project", path.relative(root, projectFile)],
    cwd: root,
  };
}

function createMakeCommand(root: string, target: string): ResolvedCommand {
  return {
    command: "make",
    args: [target],
    cwd: root,
  };
}

function selectScript(
  manifest: PackageManifest | null,
  names: readonly string[],
): string | null {
  for (const name of names) {
    if (manifest?.scripts?.[name]) return name;
  }
  return null;
}

function selectScriptByCommand(
  manifest: PackageManifest | null,
  names: readonly string[],
  commandPatterns: RegExp[],
): string | null {
  const exact = selectScript(manifest, names);
  if (exact) return exact;

  for (const [name, script] of Object.entries(manifest?.scripts ?? {})) {
    if (!/(db|migrat|seed|drizzle|prisma|sequelize)/i.test(name)) continue;
    if (commandPatterns.some((pattern) => pattern.test(script))) {
      return name;
    }
  }
  return null;
}

function relativePathsFromAbsolute(root: string, absolutePaths: string[]): string[] {
  return [...new Set(
    absolutePaths
      .filter((absolutePath) => absolutePath.startsWith(root) && fileExists(absolutePath))
      .map((absolutePath) => path.relative(root, absolutePath)),
  )].sort();
}

function hasDependency(manifest: PackageManifest | null, name: string): boolean {
  return Boolean(manifest?.dependencies?.[name] || manifest?.devDependencies?.[name]);
}

function detectPrisma(root: string, _manifest: PackageManifest | null): DetectedDatabaseProject | null {
  const schemaPaths = findFilesByName(root, ["schema.prisma"]).filter((relativePath) =>
    relativePath.endsWith(path.join("prisma", "schema.prisma")),
  );
  for (const schemaRelativePath of schemaPaths) {
    const schemaPath = path.join(root, schemaRelativePath);
    const schema = readText(schemaPath);
    if (!schema || !/provider\s*=\s*"postgresql"/.test(schema)) continue;

    const commandRoot = findNearestPackageRoot(root, path.dirname(schemaPath)) ?? root;
    const commandManifest = readJson<PackageManifest>(path.join(commandRoot, "package.json"));
    const migrateScript = selectScriptByCommand(
      commandManifest,
      MIGRATION_SCRIPT_NAMES,
      [/prisma\s+migrate/i],
    );
    const seedScript = selectScriptByCommand(
      commandManifest,
      SEED_SCRIPT_NAMES,
      [/prisma\s+db\s+seed/i, /prisma.*seed/i],
    );
    const makeMigrationTarget = selectMakeTarget(commandRoot, MIGRATION_TARGET_NAMES);
    const makeSeedTarget = selectMakeTarget(commandRoot, SEED_TARGET_NAMES);
    const migrationCommand = migrateScript
      ? createJsRunCommand(commandRoot, migrateScript)
      : makeMigrationTarget
        ? createMakeCommand(commandRoot, makeMigrationTarget)
        : createJsExecCommand(commandRoot, ["prisma", "migrate", "deploy"]);
    const seedCommand = seedScript
      ? createJsRunCommand(commandRoot, seedScript)
      : makeSeedTarget
        ? createMakeCommand(commandRoot, makeSeedTarget)
        : commandManifest?.prisma?.seed
          ? createJsExecCommand(commandRoot, ["prisma", "db", "seed"])
          : null;

    return {
      supported: true,
      framework: "prisma",
      projectRoot: root,
      migrationCommand,
      seedCommand,
      fingerprintPaths: listMatchingFiles(root, [
        ...relativePathsFromAbsolute(root, [path.join(commandRoot, "package.json")]),
        ...findAncestorLockfiles(root, commandRoot),
        schemaRelativePath,
        path.join(path.dirname(schemaRelativePath), "migrations"),
      ]),
      baselineSeedPaths: listMatchingFiles(root, [
        ...relativePathsFromAbsolute(root, [path.join(commandRoot, "package.json")]),
        path.join(path.dirname(schemaRelativePath), "seed.ts"),
        path.join(path.dirname(schemaRelativePath), "seed.js"),
        path.join(path.dirname(schemaRelativePath), "seed.mjs"),
        path.join(path.dirname(schemaRelativePath), "seed.cjs"),
      ]),
      postgresVersion: readPostgresVersion(root),
    };
  }
  return null;
}

function detectDrizzle(root: string, _manifest: PackageManifest | null): DetectedDatabaseProject | null {
  const configPaths = findFilesByName(root, [
    "drizzle.config.ts",
    "drizzle.config.js",
    "drizzle.config.mts",
    "drizzle.config.cts",
  ]);
  if (configPaths.length === 0) return null;

  for (const configRelativePath of configPaths) {
    const configDir = path.dirname(path.join(root, configRelativePath));
    const commandRoot = findNearestPackageRoot(root, configDir) ?? configDir;
    const commandManifest = readJson<PackageManifest>(path.join(commandRoot, "package.json"));
    const migrateScript = selectScriptByCommand(
      commandManifest,
      MIGRATION_SCRIPT_NAMES,
      [/drizzle-kit\s+migrate/i, /turbo\s+run\s+db:migrate/i],
    );
    const seedScript = selectScriptByCommand(
      commandManifest,
      SEED_SCRIPT_NAMES,
      [/db:seed/i, /seed/i],
    );
    const makeMigrationTarget = selectMakeTarget(commandRoot, MIGRATION_TARGET_NAMES);
    const makeSeedTarget = selectMakeTarget(commandRoot, SEED_TARGET_NAMES);

    return {
      supported: true,
      framework: "drizzle",
      projectRoot: root,
      migrationCommand: migrateScript
        ? createJsRunCommand(commandRoot, migrateScript)
        : makeMigrationTarget
          ? createMakeCommand(commandRoot, makeMigrationTarget)
          : createJsExecCommand(commandRoot, ["drizzle-kit", "migrate"]),
      seedCommand: seedScript
        ? createJsRunCommand(commandRoot, seedScript)
        : makeSeedTarget
          ? createMakeCommand(commandRoot, makeSeedTarget)
          : null,
      fingerprintPaths: listMatchingFiles(root, [
        configRelativePath,
        "drizzle",
        path.join(path.dirname(configRelativePath), "drizzle"),
        ...relativePathsFromAbsolute(root, [path.join(commandRoot, "package.json")]),
        ...findAncestorLockfiles(root, commandRoot),
      ]),
      baselineSeedPaths: listMatchingFiles(root, [
        ...relativePathsFromAbsolute(root, [path.join(commandRoot, "package.json")]),
        "scripts",
        "db/seed",
        path.join(path.relative(root, commandRoot), "scripts"),
        path.join(path.relative(root, commandRoot), "db/seed"),
      ]),
      postgresVersion: readPostgresVersion(root),
    };
  }

  return null;
}

function detectSequelize(root: string, manifest: PackageManifest | null): DetectedDatabaseProject | null {
  const configPaths = findFilesByName(root, [
    ".sequelizerc",
    "config/config.js",
    "config/config.cjs",
    "config/config.ts",
    "config/config.json",
  ]);
  const packageJsonPaths = findFilesByName(root, ["package.json"]);
  for (const packageJsonRelativePath of packageJsonPaths) {
    const commandRoot = path.dirname(path.join(root, packageJsonRelativePath));
    const commandManifest = readJson<PackageManifest>(path.join(root, packageJsonRelativePath));
    const hasSequelize =
      hasDependency(commandManifest, "sequelize") || hasDependency(commandManifest, "sequelize-cli");
    const configPath = findFirstExisting(commandRoot, [
      ".sequelizerc",
      "config/config.js",
      "config/config.cjs",
      "config/config.ts",
      "config/config.json",
    ]);
    if (!hasSequelize && !configPath && configPaths.length === 0) continue;

    const configText = configPath ? readText(configPath) ?? "" : JSON.stringify(commandManifest ?? {});
    if (!/postgres|postgresql|pg/.test(configText) && !hasDependency(commandManifest, "pg")) {
      continue;
    }

    const migrateScript = selectScriptByCommand(
      commandManifest,
      MIGRATION_SCRIPT_NAMES,
      [/sequelize-cli\s+db:migrate/i],
    );
    const seedScript = selectScriptByCommand(
      commandManifest,
      SEED_SCRIPT_NAMES,
      [/sequelize-cli\s+db:seed:all/i, /seed/i],
    );
    const makeMigrationTarget = selectMakeTarget(commandRoot, MIGRATION_TARGET_NAMES);
    const makeSeedTarget = selectMakeTarget(commandRoot, SEED_TARGET_NAMES);

    return {
      supported: true,
      framework: "sequelize",
      projectRoot: root,
      migrationCommand: migrateScript
        ? createJsRunCommand(commandRoot, migrateScript)
        : makeMigrationTarget
          ? createMakeCommand(commandRoot, makeMigrationTarget)
          : createJsExecCommand(commandRoot, ["sequelize-cli", "db:migrate"]),
      seedCommand: seedScript
        ? createJsRunCommand(commandRoot, seedScript)
        : makeSeedTarget
          ? createMakeCommand(commandRoot, makeSeedTarget)
          : fileExists(path.join(commandRoot, "seeders"))
            ? createJsExecCommand(commandRoot, ["sequelize-cli", "db:seed:all"])
            : null,
      fingerprintPaths: listMatchingFiles(root, [
        packageJsonRelativePath,
        ...findAncestorLockfiles(root, commandRoot),
        path.join(path.relative(root, commandRoot), "migrations"),
        path.join(path.relative(root, commandRoot), "config"),
        path.join(path.relative(root, commandRoot), ".sequelizerc"),
      ]),
      baselineSeedPaths: listMatchingFiles(root, [
        packageJsonRelativePath,
        path.join(path.relative(root, commandRoot), "seeders"),
      ]),
      postgresVersion: readPostgresVersion(root),
    };
  }
  return null;
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
