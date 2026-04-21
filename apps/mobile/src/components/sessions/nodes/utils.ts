/** Shared helpers for session node renderers. Mirror of web's messages/utils.ts. */

export function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stripMatchingQuotes(text: string): string {
  if (text.length < 2) return text;
  const first = text[0];
  const last = text[text.length - 1];
  if ((first === "'" || first === '"') && last === first) {
    return text.slice(1, -1);
  }
  return text;
}

export function formatCommandLabel(command: string): string {
  const trimmed = command.trim();
  const shellWrapper = trimmed.match(/^(?:\/bin\/)?(?:zsh|bash|sh)\s+-lc\s+([\s\S]+)$/i);
  if (!shellWrapper) return trimmed;
  const inner = stripMatchingQuotes(shellWrapper[1].trim());
  return inner || trimmed;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export function serializeUnknown(value: unknown, maxLen = 2000): string {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return truncate(s, maxLen);
  } catch {
    return String(value);
  }
}

const TRACE_INTERNAL_RE = /<trace-internal>[\s\S]*?<\/trace-internal>\s*/g;
const CONVERSATION_HISTORY_RE = /<conversation-history>[\s\S]*?<\/conversation-history>\s*/g;
const PLAN_PREFIX =
  "Before implementing, first create a detailed plan and present it for review. Use plan mode. Once the plan is approved, proceed with implementation.";

/** Strip server-wrapped prompt prefixes so the stored prompt renders as the user typed it. */
export function stripPromptWrapping(text: string): string {
  let cleaned = text.replace(TRACE_INTERNAL_RE, "");
  cleaned = cleaned.replace(CONVERSATION_HISTORY_RE, "");
  if (cleaned.startsWith(PLAN_PREFIX)) {
    cleaned = cleaned.slice(PLAN_PREFIX.length);
  }
  return cleaned.trim();
}

const EXPLORATION_COMMANDS = new Set([
  "cat",
  "find",
  "git",
  "grep",
  "head",
  "ls",
  "pwd",
  "rg",
  "sed",
  "tail",
]);

/** "Explored" for read-only commands, "Ran" for everything else. */
export function getCommandPrefix(command: string): string {
  const normalized = formatCommandLabel(command);
  const [binary = ""] = normalized.trim().split(/\s+/, 1);
  if (binary === "git") {
    if (/\bgit\s+(status|show|log|diff|branch)\b/.test(normalized)) return "Explored";
    return "Ran";
  }
  return EXPLORATION_COMMANDS.has(binary) ? "Explored" : "Ran";
}
