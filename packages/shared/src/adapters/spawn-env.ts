import { statSync } from "fs";
import { delimiter, join } from "path";

const MAX_CHILD_ENV_BYTES = 64 * 1024;
const MAX_CHILD_ENV_VALUE_BYTES = 16 * 1024;

/**
 * Bin directories that GUI-launched processes (e.g. the Electron bridge) often
 * miss from PATH even though an interactive shell has them. Coding-tool CLIs
 * installed outside the system npm prefix live here — notably `cursor-agent`,
 * which the Cursor installer drops in ~/.local/bin.
 */
function commonBinDirs(source: NodeJS.ProcessEnv): string[] {
  const home = source.HOME;
  const dirs = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];
  if (home) {
    dirs.unshift(
      join(home, ".local/bin"),
      join(home, ".cursor/bin"),
      join(home, ".npm-global/bin"),
    );
  }
  return dirs;
}

/** PATH with common install dirs appended, so spawns can find CLIs the launching shell had. */
export function augmentedPath(source: NodeJS.ProcessEnv = process.env): string {
  const parts = source.PATH ? source.PATH.split(delimiter) : [];
  for (const dir of commonBinDirs(source)) {
    if (!parts.includes(dir)) parts.push(dir);
  }
  return parts.filter(Boolean).join(delimiter);
}

/**
 * Resolve an executable to an absolute path by scanning the augmented PATH.
 * Returns null when not found. Does not execute the binary, so it's immune to
 * per-tool `--version` quirks, slow cold starts, and non-interactive hangs.
 */
export function resolveExecutable(
  command: string,
  source: NodeJS.ProcessEnv = process.env,
): string | null {
  if (command.includes("/")) {
    try {
      return statSync(command).isFile() ? command : null;
    } catch {
      return null;
    }
  }
  for (const dir of augmentedPath(source).split(delimiter)) {
    if (!dir) continue;
    const full = join(dir, command);
    try {
      if (statSync(full).isFile()) return full;
    } catch {
      // Not in this dir — keep scanning.
    }
  }
  return null;
}

const ESSENTIAL_ENV_KEYS = new Set([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "CODEX_ACCESS_TOKEN",
  "CODEX_API_KEY",
  "CODEX_AUTH_JSON",
  "CODEX_AUTH_METHOD",
  "CODEX_HOME",
  "HOME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_ORG_ID",
  "OPENAI_PROJECT_ID",
  "PATH",
  "PWD",
  "SHELL",
  "TERM",
  "TMPDIR",
  "USER",
]);

type EnvEntry = {
  key: string;
  value: string;
  bytes: number;
  essential: boolean;
};

function envEntryBytes(key: string, value: string): number {
  return Buffer.byteLength(`${key}=${value}\0`, "utf8");
}

function isEssentialEnvKey(key: string): boolean {
  return ESSENTIAL_ENV_KEYS.has(key) || key.startsWith("LC_");
}

export function buildChildProcessEnv(
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  // Ensure common CLI install dirs are on PATH so spawned tools resolve even
  // when the launching process (e.g. a GUI-launched Electron app) has a
  // narrower PATH than the user's interactive shell.
  source = { ...source, PATH: augmentedPath(source) };
  const entries: EnvEntry[] = [];

  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string") continue;

    const bytes = envEntryBytes(key, value);
    const essential = isEssentialEnvKey(key);
    if (!essential && bytes > MAX_CHILD_ENV_VALUE_BYTES) continue;

    entries.push({ key, value, bytes, essential });
  }

  let totalBytes = entries.reduce((total, entry) => total + entry.bytes, 0);
  if (totalBytes > MAX_CHILD_ENV_BYTES) {
    const dropCandidates = [...entries]
      .filter((entry) => !entry.essential)
      .sort((left, right) => right.bytes - left.bytes);
    const dropped = new Set<string>();

    for (const entry of dropCandidates) {
      if (totalBytes <= MAX_CHILD_ENV_BYTES) break;
      dropped.add(entry.key);
      totalBytes -= entry.bytes;
    }

    return Object.fromEntries(
      entries.filter((entry) => !dropped.has(entry.key)).map((entry) => [entry.key, entry.value]),
    );
  }

  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
}
