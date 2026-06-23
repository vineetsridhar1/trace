const MAX_CHILD_ENV_BYTES = 64 * 1024;
const MAX_CHILD_ENV_VALUE_BYTES = 16 * 1024;

const ESSENTIAL_ENV_KEYS = new Set([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
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
  return (
    ESSENTIAL_ENV_KEYS.has(key) || key.startsWith("LC_") || key.startsWith("TRACE_MCP_TOKEN_")
  );
}

export function buildChildProcessEnv(
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
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
