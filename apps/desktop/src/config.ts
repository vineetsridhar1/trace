import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { app } from "electron";
import type { BridgeTunnelMode, BridgeTunnelProvider } from "@trace/shared";

export interface LocalRepoConfig {
  path: string;
  gitHooksEnabled: boolean;
  linkedCheckout: LinkedCheckoutConfig | null;
}

type RawLocalRepoConfig = string | LocalRepoConfig;

export interface LinkedCheckoutConfig {
  sessionGroupId: string;
  targetBranch: string;
  autoSyncEnabled: boolean;
  originalBranch: string | null;
  originalCommitSha: string;
  lastSyncedCommitSha: string | null;
  lastSyncError: string | null;
  lastSyncAt: string | null;
}

export interface BridgeTunnelSlotConfig {
  id: string;
  label: string;
  provider: BridgeTunnelProvider;
  mode: BridgeTunnelMode;
  publicUrl: string;
  targetPort: number | null;
  updatedAt: string;
}

export interface LocalBridgeConfig {
  tunnelSlots: BridgeTunnelSlotConfig[];
}

export interface RepoPathConfig {
  repos: Record<string, LocalRepoConfig>; // repoId → local repo settings
  bridge: LocalBridgeConfig;
}

type RawLocalBridgeConfig = {
  tunnelSlots?: unknown;
};

type RawConfig = {
  repos?: Record<string, RawLocalRepoConfig>;
  bridge?: RawLocalBridgeConfig;
};

function emptyBridgeConfig(): LocalBridgeConfig {
  return { tunnelSlots: [] };
}

function normalizeRepoConfigEntry(entry: unknown): LocalRepoConfig | null {
  if (typeof entry === "string" && entry.trim()) {
    return {
      path: entry,
      gitHooksEnabled: false,
      linkedCheckout: null,
    };
  }

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const raw = entry as {
    path?: unknown;
    gitHooksEnabled?: unknown;
    linkedCheckout?: unknown;
  };

  if (typeof raw.path !== "string" || !raw.path.trim()) {
    return null;
  }

  return {
    path: raw.path,
    gitHooksEnabled: raw.gitHooksEnabled === true,
    linkedCheckout: normalizeLinkedCheckoutEntry(raw.linkedCheckout),
  };
}

function normalizeLinkedCheckoutEntry(entry: unknown): LinkedCheckoutConfig | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const raw = entry as {
    sessionGroupId?: unknown;
    targetBranch?: unknown;
    autoSyncEnabled?: unknown;
    originalBranch?: unknown;
    originalCommitSha?: unknown;
    lastSyncedCommitSha?: unknown;
    lastSyncError?: unknown;
    lastSyncAt?: unknown;
  };

  if (
    typeof raw.sessionGroupId !== "string" ||
    !raw.sessionGroupId.trim() ||
    typeof raw.targetBranch !== "string" ||
    !raw.targetBranch.trim() ||
    typeof raw.originalCommitSha !== "string" ||
    !raw.originalCommitSha.trim()
  ) {
    return null;
  }

  return {
    sessionGroupId: raw.sessionGroupId,
    targetBranch: raw.targetBranch,
    autoSyncEnabled: raw.autoSyncEnabled !== false,
    originalBranch: typeof raw.originalBranch === "string" ? raw.originalBranch : null,
    originalCommitSha: raw.originalCommitSha,
    lastSyncedCommitSha:
      typeof raw.lastSyncedCommitSha === "string" ? raw.lastSyncedCommitSha : null,
    lastSyncError: typeof raw.lastSyncError === "string" ? raw.lastSyncError : null,
    lastSyncAt: typeof raw.lastSyncAt === "string" ? raw.lastSyncAt : null,
  };
}

function normalizeTunnelSlotEntry(entry: unknown): BridgeTunnelSlotConfig | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const raw = entry as {
    id?: unknown;
    label?: unknown;
    provider?: unknown;
    mode?: unknown;
    publicUrl?: unknown;
    targetPort?: unknown;
    updatedAt?: unknown;
  };

  if (
    typeof raw.id !== "string" ||
    !raw.id.trim() ||
    typeof raw.label !== "string" ||
    !raw.label.trim() ||
    (raw.provider !== "custom" && raw.provider !== "ngrok") ||
    (raw.mode !== "manual" && raw.mode !== "trace_managed") ||
    typeof raw.publicUrl !== "string" ||
    !raw.publicUrl.trim()
  ) {
    return null;
  }

  const targetPort =
    typeof raw.targetPort === "number" &&
    Number.isInteger(raw.targetPort) &&
    raw.targetPort >= 1 &&
    raw.targetPort <= 65535
      ? raw.targetPort
      : null;

  return {
    id: raw.id,
    label: raw.label.trim(),
    provider: raw.provider,
    mode: raw.mode,
    publicUrl: raw.publicUrl.trim(),
    targetPort,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt.trim()
        ? raw.updatedAt
        : new Date().toISOString(),
  };
}

function normalizeBridgeConfigEntry(entry: unknown): LocalBridgeConfig {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return emptyBridgeConfig();
  }

  const raw = entry as { tunnelSlots?: unknown };
  const tunnelSlots = Array.isArray(raw.tunnelSlots)
    ? raw.tunnelSlots
        .map((slot) => normalizeTunnelSlotEntry(slot))
        .filter((slot): slot is BridgeTunnelSlotConfig => slot !== null)
    : [];

  return { tunnelSlots };
}

function sanitizeTunnelSlot(slot: BridgeTunnelSlotConfig): BridgeTunnelSlotConfig {
  const targetPort =
    typeof slot.targetPort === "number" &&
    Number.isInteger(slot.targetPort) &&
    slot.targetPort >= 1 &&
    slot.targetPort <= 65535
      ? slot.targetPort
      : null;

  return {
    id: slot.id.trim() || randomUUID(),
    label: slot.label.trim() || "Tunnel",
    provider: slot.provider === "ngrok" ? "ngrok" : "custom",
    mode: slot.mode === "trace_managed" ? "trace_managed" : "manual",
    publicUrl: slot.publicUrl.trim(),
    targetPort,
    updatedAt: new Date().toISOString(),
  };
}

export function getConfigPath(): string {
  const home = app.getPath("home");
  return path.join(home, ".trace", "config.json");
}

export function readConfig(): RepoPathConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf-8");
    const parsed = JSON.parse(raw) as RawConfig;
    const repos = Object.fromEntries(
      Object.entries(parsed.repos ?? {})
        .map(([repoId, entry]) => [repoId, normalizeRepoConfigEntry(entry)])
        .filter((entry): entry is [string, LocalRepoConfig] => entry[1] != null),
    );
    return {
      repos,
      bridge: normalizeBridgeConfigEntry(parsed.bridge),
    };
  } catch {
    return { repos: {}, bridge: emptyBridgeConfig() };
  }
}

function writeConfigAtomic(config: RepoPathConfig): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const tmpPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), "utf-8");
  fs.renameSync(tmpPath, configPath);
}

// Serializes all mutations through a single promise chain so read-modify-write
// sequences from concurrent IPC handlers cannot interleave and clobber each other.
let mutationChain: Promise<unknown> = Promise.resolve();

function mutate<T>(fn: (config: RepoPathConfig) => T): Promise<T> {
  const next = mutationChain.then(() => {
    const config = readConfig();
    const result = fn(config);
    writeConfigAtomic(config);
    return result;
  });
  mutationChain = next.catch(() => undefined);
  return next;
}

export function getRepoConfig(repoId: string): LocalRepoConfig | null {
  return readConfig().repos[repoId] ?? null;
}

export function getRepoPath(repoId: string): string | null {
  return getRepoConfig(repoId)?.path ?? null;
}

export function saveRepoPath(repoId: string, localPath: string): Promise<LocalRepoConfig> {
  return mutate((config) => {
    const current = config.repos[repoId];
    const preserveLinkedCheckout = current?.path === localPath ? current.linkedCheckout : null;

    const next: LocalRepoConfig = {
      path: localPath,
      gitHooksEnabled: current?.gitHooksEnabled ?? false,
      linkedCheckout: preserveLinkedCheckout ?? null,
    };
    config.repos[repoId] = next;
    return next;
  });
}

export function setRepoGitHooksEnabled(
  repoId: string,
  gitHooksEnabled: boolean,
): Promise<LocalRepoConfig | null> {
  return mutate((config) => {
    const current = config.repos[repoId];
    if (!current) return null;

    const next: LocalRepoConfig = { ...current, gitHooksEnabled };
    config.repos[repoId] = next;
    return next;
  });
}

export function setRepoLinkedCheckout(
  repoId: string,
  linkedCheckout: LinkedCheckoutConfig | null,
): Promise<LocalRepoConfig | null> {
  return mutate((config) => {
    const current = config.repos[repoId];
    if (!current) return null;

    const next: LocalRepoConfig = { ...current, linkedCheckout };
    config.repos[repoId] = next;
    return next;
  });
}

export function getBridgeConfig(): LocalBridgeConfig {
  return readConfig().bridge;
}

export function getBridgeTunnelSlots(): BridgeTunnelSlotConfig[] {
  return getBridgeConfig().tunnelSlots;
}

export function saveBridgeTunnelSlots(
  slots: BridgeTunnelSlotConfig[],
): Promise<BridgeTunnelSlotConfig[]> {
  return mutate((config) => {
    config.bridge = {
      tunnelSlots: slots
        .map((slot) => sanitizeTunnelSlot(slot))
        .filter((slot) => slot.publicUrl.length > 0),
    };
    return config.bridge.tunnelSlots;
  });
}

/** Directory for persistent bridge state (instance ID). */
function getBridgeStatePath(): string {
  return path.join(app.getPath("userData"), "bridge");
}

/**
 * Returns a stable instance ID for this user, persisted to Electron's userData directory.
 * Survives app restarts so the server can recognize the same runtime reconnecting.
 */
export function getOrCreateInstanceId(): string {
  const idPath = path.join(getBridgeStatePath(), "instance-id");
  try {
    const existing = fs.readFileSync(idPath, "utf-8").trim();
    if (existing) return existing;
  } catch {
    // File doesn't exist yet
  }
  const id = randomUUID();
  fs.mkdirSync(path.dirname(idPath), { recursive: true });
  fs.writeFileSync(idPath, id, "utf-8");
  return id;
}
