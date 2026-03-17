import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { app } from "electron";

export interface RepoPathConfig {
  repos: Record<string, string>; // repoId → local folder path
}

export function getConfigPath(): string {
  const home = app.getPath("home");
  return path.join(home, ".trace", "config.json");
}

export function readConfig(): RepoPathConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), "utf-8");
    return JSON.parse(raw) as RepoPathConfig;
  } catch {
    return { repos: {} };
  }
}

export function writeConfig(config: RepoPathConfig): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
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

