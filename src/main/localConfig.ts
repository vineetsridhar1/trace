import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface LocalChannelConfig {
  localRepoPath: string;
  creationScript?: string;
  startupScripts?: { name: string; command: string }[];
}

interface LocalConfigFile {
  channels: Record<string, LocalChannelConfig>;
}

const CONFIG_DIR = path.join(os.homedir(), '.trace');
const CONFIG_PATH = path.join(CONFIG_DIR, 'local-config.json');

function readConfig(): LocalConfigFile {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw) as LocalConfigFile;
  } catch {
    return { channels: {} };
  }
}

function writeConfig(config: LocalConfigFile): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function getChannelLocalConfig(id: string): LocalChannelConfig | null {
  const config = readConfig();
  return config.channels[id] ?? null;
}

export function setChannelLocalConfig(id: string, data: LocalChannelConfig): void {
  const config = readConfig();
  config.channels[id] = data;
  writeConfig(config);
}

export function getAllChannelLocalConfigs(): Record<string, LocalChannelConfig> {
  return readConfig().channels;
}

export function deleteChannelLocalConfig(id: string): void {
  const config = readConfig();
  delete config.channels[id];
  writeConfig(config);
}
