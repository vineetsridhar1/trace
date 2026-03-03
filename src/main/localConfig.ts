import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface LocalChannelConfig {
  localRepoPath: string;
  setupScript?: string;
  runScript?: string;
  systemInstructions?: string;
}

export interface GlobalAppConfig {
  terminalFontFamily?: string;
}

interface LegacyChannelConfig {
  localRepoPath: string;
  creationScript?: string;
  startupScripts?: { name: string; command: string }[];
  setupScript?: string;
  runScript?: string;
  systemInstructions?: string;
}

interface LocalConfigFile {
  channels: Record<string, LocalChannelConfig>;
  global?: GlobalAppConfig;
}

const CONFIG_DIR = path.join(os.homedir(), ".trace");
const CONFIG_PATH = path.join(CONFIG_DIR, "local-config.json");

/** Migrate legacy field names (creationScript, startupScripts) to new ones */
function migrateEntry(cfg: LegacyChannelConfig): LocalChannelConfig {
  return {
    localRepoPath: cfg.localRepoPath,
    setupScript: cfg.setupScript ?? cfg.creationScript,
    runScript:
      cfg.runScript ??
      (cfg.startupScripts?.map((s) => s.command).join("\n") || undefined),
    systemInstructions: cfg.systemInstructions,
  };
}

function readConfig(): LocalConfigFile {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as {
      channels: Record<string, LegacyChannelConfig>;
      global?: GlobalAppConfig;
    };
    const channels: Record<string, LocalChannelConfig> = {};
    for (const [id, cfg] of Object.entries(parsed.channels)) {
      channels[id] = migrateEntry(cfg);
    }
    return { channels, global: parsed.global };
  } catch {
    return { channels: {} };
  }
}

function writeConfig(config: LocalConfigFile): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function getChannelLocalConfig(id: string): LocalChannelConfig | null {
  const config = readConfig();
  return config.channels[id] ?? null;
}

export function setChannelLocalConfig(
  id: string,
  data: LocalChannelConfig,
): void {
  const config = readConfig();
  config.channels[id] = data;
  writeConfig(config);
}

export function getAllChannelLocalConfigs(): Record<
  string,
  LocalChannelConfig
> {
  return readConfig().channels;
}

export function deleteChannelLocalConfig(id: string): void {
  const config = readConfig();
  delete config.channels[id];
  writeConfig(config);
}

export function getGlobalConfig(): GlobalAppConfig {
  return readConfig().global ?? {};
}

export function setGlobalConfig(data: GlobalAppConfig): void {
  const config = readConfig();
  config.global = data;
  writeConfig(config);
}
