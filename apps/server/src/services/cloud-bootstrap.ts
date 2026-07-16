import { readFileSync } from "fs";
import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { encryptSecret } from "../lib/encryption.js";
import { runtimeAdapterRegistry } from "../lib/runtime-adapters.js";
import { isLocalMode } from "../lib/mode.js";

/**
 * Seeds the shared cloud (a `provisioned` agent environment) into every
 * organization from a gitignored JSON file so all orgs inherit it by default.
 *
 * The file carries raw secret values (launcher auth token + runtime env), which
 * is why it is gitignored — never commit it. Ops/devs drop the file in place and
 * the server loads it into the DB on startup and for every new org.
 *
 * Customers override the default cloud through the normal product surface: they
 * disable/delete the managed environment and configure their own. Once a managed
 * environment is disabled or the org already runs its own enabled cloud, seeding
 * leaves it untouched.
 */

/** Marks the environment we own so re-seeding can keep it in sync without clobbering customer clouds. */
const MANAGED_MARKER = "trace-cloud-config";
/** OrgSecret name holding the launcher auth token. */
const AUTH_SECRET_NAME = "TRACE_CLOUD_AUTH";
/** Prefix for OrgSecrets holding runtime env values. */
const RUNTIME_ENV_SECRET_PREFIX = "TRACE_CLOUD_ENV_";
const DEFAULT_CLOUD_ENV_NAME = "Trace Cloud";
const DEFAULT_STARTUP_TIMEOUT_SECONDS = 180;
const DEFAULT_DEPROVISION_POLICY = "on_session_end";

type RawCloudAuth = { type: "bearer" | "hmac"; secret: string };
type RawCloudRuntimeEnv = { name: string; secret: string };

export type RawCloudConfig = {
  name?: string;
  startUrl: string;
  stopUrl: string;
  statusUrl: string;
  auth: RawCloudAuth;
  startupTimeoutSeconds?: number;
  deprovisionPolicy?: "on_session_end" | "manual";
  capabilities?: { supportedTools?: string[] };
  runtimeEnv?: RawCloudRuntimeEnv[];
  launcherMetadata?: Record<string, unknown>;
};

type EnsureCloudResult = "created" | "updated" | "skipped_override";

// `undefined` = not yet loaded, `null` = absent or invalid (seeding disabled).
let cachedConfig: RawCloudConfig | null | undefined;

function resolveConfigPath(): string {
  const explicit = process.env.TRACE_CLOUD_CONFIG_PATH?.trim();
  if (explicit) return path.resolve(explicit);
  return path.resolve(process.cwd(), "cloud.config.json");
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`cloud config requires a non-empty string for ${field}`);
  }
  return value;
}

function parseRawCloudConfig(parsed: unknown): RawCloudConfig {
  const root = asRecord(parsed, "cloud config must be a JSON object");
  const auth = asRecord(root.auth, "cloud config requires an auth object");
  if (auth.type !== "bearer" && auth.type !== "hmac") {
    throw new Error("cloud config auth.type must be 'bearer' or 'hmac'");
  }

  const runtimeEnv = root.runtimeEnv === undefined ? [] : root.runtimeEnv;
  if (!Array.isArray(runtimeEnv)) {
    throw new Error("cloud config runtimeEnv must be an array");
  }
  const parsedRuntimeEnv = runtimeEnv.map((entry, index) => {
    const record = asRecord(entry, `cloud config runtimeEnv[${index}] must be an object`);
    return {
      name: requireString(record.name, `runtimeEnv[${index}].name`),
      secret: requireString(record.secret, `runtimeEnv[${index}].secret`),
    };
  });

  const supportedTools =
    root.capabilities && typeof root.capabilities === "object"
      ? (root.capabilities as Record<string, unknown>).supportedTools
      : undefined;
  if (supportedTools !== undefined && !Array.isArray(supportedTools)) {
    throw new Error("cloud config capabilities.supportedTools must be an array");
  }

  return {
    name: typeof root.name === "string" && root.name.trim() ? root.name.trim() : undefined,
    startUrl: requireString(root.startUrl, "startUrl"),
    stopUrl: requireString(root.stopUrl, "stopUrl"),
    statusUrl: requireString(root.statusUrl, "statusUrl"),
    auth: { type: auth.type, secret: requireString(auth.secret, "auth.secret") },
    startupTimeoutSeconds:
      typeof root.startupTimeoutSeconds === "number" ? root.startupTimeoutSeconds : undefined,
    deprovisionPolicy:
      root.deprovisionPolicy === "manual" || root.deprovisionPolicy === "on_session_end"
        ? root.deprovisionPolicy
        : undefined,
    ...(supportedTools !== undefined
      ? { capabilities: { supportedTools: supportedTools as string[] } }
      : {}),
    runtimeEnv: parsedRuntimeEnv,
    ...(root.launcherMetadata !== undefined
      ? {
          launcherMetadata: asRecord(
            root.launcherMetadata,
            "cloud config launcherMetadata must be an object",
          ),
        }
      : {}),
  };
}

/**
 * Reads and validates the cloud config file. Never throws: a missing file
 * disables seeding silently; an invalid file logs an error and disables seeding
 * so a bad config never crashes boot or org creation. Cached for the process.
 */
export function loadCloudConfig(): RawCloudConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  const filePath = resolveConfigPath();
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    cachedConfig = null;
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    cachedConfig = parseRawCloudConfig(parsed);
  } catch (err) {
    console.error(`[cloud-config] ignoring invalid ${filePath}: ${(err as Error).message}`);
    cachedConfig = null;
  }
  return cachedConfig;
}

async function upsertOrgSecret(
  tx: Prisma.TransactionClient,
  organizationId: string,
  name: string,
  plaintext: string,
): Promise<string> {
  const { encrypted, iv } = encryptSecret(plaintext);
  const secret = await tx.orgSecret.upsert({
    where: { organizationId_name: { organizationId, name } },
    create: { organizationId, name, encryptedValue: encrypted, iv },
    update: { encryptedValue: encrypted, iv },
    select: { id: true },
  });
  return secret.id;
}

function buildProvisionedConfig(
  config: RawCloudConfig,
  authSecretId: string,
  runtimeEnv: Array<{ name: string; secretId: string }>,
): Prisma.InputJsonObject {
  return {
    managedBy: MANAGED_MARKER,
    startUrl: config.startUrl,
    stopUrl: config.stopUrl,
    statusUrl: config.statusUrl,
    auth: { type: config.auth.type, secretId: authSecretId },
    startupTimeoutSeconds: config.startupTimeoutSeconds ?? DEFAULT_STARTUP_TIMEOUT_SECONDS,
    deprovisionPolicy: config.deprovisionPolicy ?? DEFAULT_DEPROVISION_POLICY,
    ...(config.capabilities?.supportedTools
      ? { capabilities: { supportedTools: config.capabilities.supportedTools } }
      : {}),
    runtimeEnv,
    ...(config.launcherMetadata
      ? { launcherMetadata: config.launcherMetadata as Prisma.InputJsonValue }
      : {}),
  };
}

async function ensureCloudForOrg(
  tx: Prisma.TransactionClient,
  organizationId: string,
  config: RawCloudConfig,
): Promise<EnsureCloudResult> {
  const managed = await tx.agentEnvironment.findFirst({
    where: {
      organizationId,
      adapterType: "provisioned",
      config: { path: ["managedBy"], equals: MANAGED_MARKER },
    },
    select: { id: true },
  });

  // No managed env yet, but the org already runs its own cloud → respect the
  // override and don't create raw secrets we'd never reference.
  if (!managed) {
    const existingProvisioned = await tx.agentEnvironment.findFirst({
      where: { organizationId, adapterType: "provisioned", enabled: true },
      select: { id: true },
    });
    if (existingProvisioned) return "skipped_override";
  }

  const authSecretId = await upsertOrgSecret(
    tx,
    organizationId,
    AUTH_SECRET_NAME,
    config.auth.secret,
  );
  const runtimeEnv: Array<{ name: string; secretId: string }> = [];
  for (const entry of config.runtimeEnv ?? []) {
    const secretId = await upsertOrgSecret(
      tx,
      organizationId,
      `${RUNTIME_ENV_SECRET_PREFIX}${entry.name}`,
      entry.secret,
    );
    runtimeEnv.push({ name: entry.name, secretId });
  }

  const builtConfig = buildProvisionedConfig(config, authSecretId, runtimeEnv);
  // Reuse the adapter's own validation so a malformed cloud config fails loudly.
  await runtimeAdapterRegistry.get("provisioned").validateConfig(builtConfig);

  const name = config.name ?? DEFAULT_CLOUD_ENV_NAME;

  if (managed) {
    // Keep the managed env in sync with the file. Preserve enabled/isDefault so
    // a customer who disabled it (to run their own cloud) stays overridden.
    await tx.agentEnvironment.update({
      where: { id: managed.id },
      data: { name, config: builtConfig },
    });
    return "updated";
  }

  const existingDefault = await tx.agentEnvironment.findFirst({
    where: { organizationId, enabled: true, isDefault: true },
    select: { id: true },
  });
  await tx.agentEnvironment.create({
    data: {
      organizationId,
      name,
      adapterType: "provisioned",
      config: builtConfig,
      enabled: true,
      isDefault: !existingDefault,
    },
  });
  return "created";
}

/** Seeds/refreshes the managed cloud for a single org in its own locked transaction. */
export async function seedCloudForOrg(
  organizationId: string,
  config: RawCloudConfig,
): Promise<EnsureCloudResult> {
  return prisma.$transaction(async (tx) => {
    // Serialize with AgentEnvironmentService default handling and other instances.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
    return ensureCloudForOrg(tx, organizationId, config);
  });
}

/**
 * Loads the cloud config (if present) and seeds it into every organization.
 * Called on server startup. No-op in local mode (cloud sessions are disabled)
 * and when no config file is present. Per-org failures are logged, not thrown.
 */
export async function seedCloudForAllOrgs(): Promise<void> {
  if (isLocalMode()) return;
  const config = loadCloudConfig();
  if (!config) {
    console.log("[cloud-config] no cloud.config.json found; skipping cloud seed");
    return;
  }

  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const org of orgs) {
    try {
      const result = await seedCloudForOrg(org.id, config);
      if (result === "created") created++;
      else if (result === "updated") updated++;
      else skipped++;
    } catch (err) {
      console.error(
        `[cloud-config] failed to seed cloud for org ${org.id}: ${(err as Error).message}`,
      );
    }
  }
  console.log(
    `[cloud-config] cloud seed complete (created=${created}, updated=${updated}, skipped=${skipped})`,
  );
}
