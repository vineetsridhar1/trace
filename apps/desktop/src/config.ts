import path from "path";
import fs from "fs";
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
