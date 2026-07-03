import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_SERVER_URL = "http://localhost:4000";

const SERVER_URL_KEY = "server_url";

function envValue(name: string): string | undefined {
  const value = process.env[name];
  return value ? value : undefined;
}

export function configDir(): string {
  return join(envValue("XDG_CONFIG_HOME") ?? join(homedir(), ".config"), "trace");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function credentialsPath(): string {
  return join(configDir(), "credentials.json");
}

function readJsonFile(path: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
    }
  } catch {
    // A corrupt file reads as empty; the next write replaces it.
  }
  return {};
}

function writeJsonFile(path: string, data: Record<string, string>, mode?: number): void {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, mode === undefined ? {} : { mode });
  if (mode !== undefined) {
    // writeFileSync only applies mode on creation; enforce it for existing files too.
    chmodSync(path, mode);
  }
}

export function getConfigValue(key: string): string | null {
  return readJsonFile(configPath())[key] ?? null;
}

export function setConfigValue(key: string, value: string): void {
  const config = readJsonFile(configPath());
  config[key] = value;
  writeJsonFile(configPath(), config);
}

export function removeConfigValue(key: string): void {
  const config = readJsonFile(configPath());
  if (!(key in config)) return;
  delete config[key];
  writeJsonFile(configPath(), config);
}

export function resolveServerUrl(override?: string): string {
  return (
    override ?? envValue("TRACE_SERVER") ?? getConfigValue(SERVER_URL_KEY) ?? DEFAULT_SERVER_URL
  );
}

export function setServerUrl(url: string): void {
  setConfigValue(SERVER_URL_KEY, url);
}

export function getToken(): string | null {
  return envValue("TRACE_TOKEN") ?? readJsonFile(credentialsPath())["token"] ?? null;
}

export function setToken(token: string): void {
  writeJsonFile(credentialsPath(), { token }, 0o600);
}

export function clearToken(): void {
  rmSync(credentialsPath(), { force: true });
}
