import type { Prisma } from "@prisma/client";
import type {
  RepoApplicationConfig,
  RepoApplicationConfigInput,
  RepoApplicationDefinition,
  RepoEnvVar,
  RepoPortDefinition,
  RepoProcessDefinition,
  RepoSetupScript,
} from "@trace/gql";
import { ValidationError } from "../lib/errors.js";
import {
  getHardcodedApplicationConfig,
  isLiteralEnv,
  type AppEnvVar,
  type HardcodedApplicationConfig,
} from "../config/hardcoded-applications.js";

type RepoIdentity = {
  name?: string | null;
  remoteUrl?: string | null;
  setupConfig?: unknown;
};

function toPublicEnv(env: AppEnvVar[]): RepoEnvVar[] {
  // The GraphQL RepoEnvVar only models secret references, so literal env
  // values (hardcoded non-secret settings) are omitted from the public view.
  return env.filter((entry): entry is RepoEnvVar => !isLiteralEnv(entry));
}

type JsonRecord = Record<string, unknown>;

const EMPTY_APPLICATION_CONFIG: RepoApplicationConfig = {
  setupScripts: [],
  applications: [],
};

const ID_RE = /^[a-z0-9_-]+$/;
const RUNTIME_PROFILE_RE = /^[a-z0-9][a-z0-9-]*$/;
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HTTP_PROTOCOLS = new Set(["http"]);

function record(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function optionalString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new ValidationError("Expected string value");
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${field} is required`);
  }
  return value.trim();
}

function validateId(id: string, field: string): string {
  if (!ID_RE.test(id)) {
    throw new ValidationError(`${field} must use lowercase letters, numbers, hyphen, or underscore`);
  }
  return id;
}

function normalizeWorkingDirectory(value: unknown): string {
  const workingDirectory = optionalString(value)?.trim() || ".";
  if (
    workingDirectory.startsWith("/") ||
    workingDirectory === ".." ||
    workingDirectory.startsWith("../") ||
    workingDirectory.includes("/../") ||
    workingDirectory.endsWith("/..")
  ) {
    throw new ValidationError("Working directories must be relative paths without '..'");
  }
  return workingDirectory;
}

function normalizeEnv(value: unknown): RepoEnvVar[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new ValidationError("Environment variables must be a list");
  const seen = new Set<string>();
  return value.map((entry) => {
    const input = record(entry);
    if (!input) throw new ValidationError("Environment variable must be an object");
    const key = requiredString(input.key, "Environment variable name");
    if (!ENV_KEY_RE.test(key)) {
      throw new ValidationError(
        "Environment variable names must start with a letter or underscore and contain only letters, numbers, or underscores",
      );
    }
    if (seen.has(key)) throw new ValidationError("Environment variable names must be unique");
    seen.add(key);
    return {
      key,
      secretName: requiredString(input.secretName, "Environment variable secret"),
    };
  });
}

function assertUnique(ids: string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new ValidationError(`${label} IDs must be unique`);
    seen.add(id);
  }
}

function normalizeDependsOn(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new ValidationError("dependsOn must be a list");
  const seen = new Set<string>();
  return value.map((entry) => {
    const id = validateId(requiredString(entry, "Dependency ID"), "Dependency ID");
    if (seen.has(id)) throw new ValidationError("dependsOn IDs must be unique");
    seen.add(id);
    return id;
  });
}

function normalizeSetupScript(value: unknown): RepoSetupScript {
  const input = record(value);
  if (!input) throw new ValidationError("Setup script must be an object");
  return {
    id: validateId(requiredString(input.id, "Setup script ID"), "Setup script ID"),
    name: requiredString(input.name, "Setup script name"),
    command: requiredString(input.command, "Setup script command"),
    workingDirectory: normalizeWorkingDirectory(input.workingDirectory),
    dependsOn: normalizeDependsOn(input.dependsOn),
    env: normalizeEnv(input.env),
  };
}

function normalizePort(value: unknown): RepoPortDefinition {
  const input = record(value);
  if (!input) throw new ValidationError("Port must be an object");
  const port = input.port;
  if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535) {
    throw new ValidationError("Port must be an integer from 1 to 65535");
  }
  const protocol = optionalString(input.protocol)?.trim() || "http";
  if (!HTTP_PROTOCOLS.has(protocol)) {
    throw new ValidationError("Only http ports are supported");
  }
  return {
    id: validateId(requiredString(input.id, "Port ID"), "Port ID"),
    label: requiredString(input.label, "Port label"),
    port: port as number,
    protocol,
    defaultForwardingEnabled: input.defaultForwardingEnabled === true,
    healthPath: optionalString(input.healthPath)?.trim() || null,
  };
}

function normalizeProcess(value: unknown): RepoProcessDefinition {
  const input = record(value);
  if (!input) throw new ValidationError("Process must be an object");
  const ports = array(input.ports).map(normalizePort);
  assertUnique(
    ports.map((port) => port.id),
    "Port",
  );
  return {
    id: validateId(requiredString(input.id, "Process ID"), "Process ID"),
    name: requiredString(input.name, "Process name"),
    command: requiredString(input.command, "Process command"),
    workingDirectory: normalizeWorkingDirectory(input.workingDirectory),
    dependsOn: normalizeDependsOn(input.dependsOn),
    env: normalizeEnv(input.env),
    required: input.required !== false,
    ports,
  };
}

function normalizeApplication(value: unknown): RepoApplicationDefinition {
  const input = record(value);
  if (!input) throw new ValidationError("Application must be an object");
  const processes = array(input.processes).map(normalizeProcess);
  assertUnique(
    processes.map((process) => process.id),
    "Process",
  );
  return {
    id: validateId(requiredString(input.id, "Application ID"), "Application ID"),
    name: requiredString(input.name, "Application name"),
    processes,
  };
}

export class RepoApplicationConfigService {
  empty(): RepoApplicationConfig {
    return { ...EMPTY_APPLICATION_CONFIG };
  }

  parseSetupConfig(setupConfig: unknown): JsonRecord {
    return record(setupConfig) ?? {};
  }

  parseApplicationConfig(setupConfig: unknown): RepoApplicationConfig {
    const root = this.parseSetupConfig(setupConfig);
    const applicationsRoot = record(root.applications);
    if (!applicationsRoot) return this.empty();
    return this.normalize(applicationsRoot);
  }

  // Resolves the effective application config for a repo: a hardcoded config
  // when the repo matches the internal registry, otherwise the config stored on
  // the repo. The result carries literal env values, so the runtime/setup path
  // must use this rather than parseApplicationConfig + raw setupConfig.
  resolveApplicationConfig(repo: RepoIdentity | null | undefined): HardcodedApplicationConfig {
    const hardcoded = repo ? getHardcodedApplicationConfig(repo) : null;
    if (hardcoded) return hardcoded;
    return this.parseApplicationConfig(repo?.setupConfig);
  }

  // True when the repo's application config is owned by the hardcoded registry.
  // Such repos ignore stored setupConfig, so edits to it must be rejected.
  isHardcoded(repo: RepoIdentity | null | undefined): boolean {
    return repo ? getHardcodedApplicationConfig(repo) != null : false;
  }

  // Projects a resolved config to the GraphQL shape for display, dropping
  // literal env values (RepoEnvVar models secret refs only).
  toPublicConfig(config: HardcodedApplicationConfig): RepoApplicationConfig {
    return {
      setupScripts: config.setupScripts.map((script) => ({
        ...script,
        env: toPublicEnv(script.env),
      })),
      applications: config.applications.map((application) => ({
        ...application,
        processes: application.processes.map((process) => ({
          ...process,
          env: toPublicEnv(process.env),
        })),
      })),
    };
  }

  normalize(input: RepoApplicationConfigInput | unknown): RepoApplicationConfig {
    const root = record(input);
    if (!root) throw new ValidationError("Application config must be an object");
    const setupScripts = array(root.setupScripts).map(normalizeSetupScript);
    const applications = array(root.applications).map(normalizeApplication);
    assertUnique(
      setupScripts.map((script) => script.id),
      "Setup script",
    );
    assertUnique(
      applications.map((application) => application.id),
      "Application",
    );
    return { setupScripts, applications };
  }

  parseRuntimeProfile(setupConfig: unknown): string | null {
    const root = this.parseSetupConfig(setupConfig);
    const profile = root.runtimeProfile;
    return typeof profile === "string" && profile ? profile : null;
  }

  /** Empty string clears the profile; the launcher falls back to its default runtime. */
  mergeRuntimeProfileIntoSetupConfig(
    existingSetupConfig: unknown,
    runtimeProfile: string,
  ): Prisma.InputJsonValue {
    const root = this.parseSetupConfig(existingSetupConfig);
    const trimmed = runtimeProfile.trim();
    if (!trimmed) {
      const { runtimeProfile: _cleared, ...rest } = root;
      return rest as Prisma.InputJsonValue;
    }
    if (!RUNTIME_PROFILE_RE.test(trimmed)) {
      throw new ValidationError(
        "Runtime profile must use lowercase letters, numbers, or hyphens",
      );
    }
    return { ...root, runtimeProfile: trimmed } as Prisma.InputJsonValue;
  }

  mergeIntoSetupConfig(
    existingSetupConfig: unknown,
    applicationConfig: RepoApplicationConfigInput,
  ): Prisma.InputJsonValue {
    const root = this.parseSetupConfig(existingSetupConfig);
    return {
      ...root,
      applications: this.normalize(applicationConfig),
    } as Prisma.InputJsonValue;
  }
}

export const repoApplicationConfigService = new RepoApplicationConfigService();
