import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { app } from "electron";

export interface LocalRepoConfig {
  path: string;
  gitHooksEnabled: boolean;
}

type RawLocalRepoConfig = string | LocalRepoConfig;

export interface RepoPathConfig {
  repos: Record<string, LocalRepoConfig>; // repoId → local repo settings
}

function normalizeRepoConfigEntry(entry: unknown): LocalRepoConfig | null {
  if (typeof entry === "string" && entry.trim()) {
    return {
      path: entry,
      gitHooksEnabled: false,
    };
  }

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  const raw = entry as {
    path?: unknown;
    gitHooksEnabled?: unknown;
  };

  if (typeof raw.path !== "string" || !raw.path.trim()) {
    return null;
  }

  return {
    path: raw.path,
    gitHooksEnabled: raw.gitHooksEnabled === true,
  };
}

export function getConfigPath(): string {
  const home = app.getPath("home");
  return path.join(home, ".trace", "config.json");
}

export function readConfig(): RepoPathConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf-8");
    const parsed = JSON.parse(raw) as { repos?: Record<string, RawLocalRepoConfig> };
    const repos = Object.fromEntries(
      Object.entries(parsed.repos ?? {})
        .map(([repoId, entry]) => [repoId, normalizeRepoConfigEntry(entry)])
        .filter((entry): entry is [string, LocalRepoConfig] => entry[1] != null),
    );
    return { repos };
  } catch {
    return { repos: {} };
  }
}

export function writeConfig(config: RepoPathConfig): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export function getRepoConfig(repoId: string): LocalRepoConfig | null {
  return readConfig().repos[repoId] ?? null;
}

export function getRepoPath(repoId: string): string | null {
  return getRepoConfig(repoId)?.path ?? null;
}

export function saveRepoPath(repoId: string, localPath: string): LocalRepoConfig {
  const config = readConfig();
  const current = config.repos[repoId];

  config.repos[repoId] = {
    path: localPath,
    gitHooksEnabled: current?.gitHooksEnabled ?? false,
  };

  writeConfig(config);
  return config.repos[repoId];
}

export function setRepoGitHooksEnabled(
  repoId: string,
  gitHooksEnabled: boolean,
): LocalRepoConfig | null {
  const config = readConfig();
  const current = config.repos[repoId];
  if (!current) return null;

  config.repos[repoId] = {
    ...current,
    gitHooksEnabled,
  };

  writeConfig(config);
  return config.repos[repoId];
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
