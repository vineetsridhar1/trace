/**
 * Shared helpers used by both web and mobile session-message renderers.
 * Lives in client-core so web (`apps/web/src/components/session/messages/utils.ts`)
 * and mobile (`apps/mobile/src/components/sessions/nodes/utils.ts`) consume a single
 * implementation — see plan §7.1.
 */

export function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MESSAGE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

export function formatMessageTimestamp(timestamp: string, now = new Date()): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Invalid Date";
  const time = MESSAGE_TIME_FORMATTER.format(date);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  if (date >= startOfToday && date < startOfTomorrow) return `Today ${time}`;

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (date >= startOfYesterday && date < startOfToday) return `Yesterday ${time}`;

  const startOfRecentWeek = new Date(startOfToday);
  startOfRecentWeek.setDate(startOfRecentWeek.getDate() - 6);
  if (date >= startOfRecentWeek && date < startOfYesterday) {
    return `${WEEKDAY_FORMATTER.format(date)} ${time}`;
  }

  return `${SHORT_DATE_FORMATTER.format(date)} at ${time}`;
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

const TRACE_INTERNAL_RE = /<trace-internal>[\s\S]*?<\/trace-internal>\s*/g;
const CONVERSATION_HISTORY_RE = /<conversation-history>[\s\S]*?<\/conversation-history>\s*/g;
export const PLAN_PREFIX =
  "Before implementing, first create a detailed plan and present it for review. Use plan mode. Once the plan is approved, proceed with implementation.";
export const ASK_PREFIX =
  "<trace-internal>\nDo NOT modify any files. Only read files and answer questions. Do not use Edit, Write, or NotebookEdit tools. This is read-only/ask mode.\n</trace-internal>\n\n";

export type InteractionMode = "code" | "plan" | "ask";

/** Wrap a user prompt with the mode-specific prefix the agent expects. */
export function wrapPrompt(mode: InteractionMode, prompt: string): string {
  if (mode === "plan") return `${PLAN_PREFIX}\n\n${prompt}`;
  if (mode === "ask") return `${ASK_PREFIX}${prompt}`;
  return prompt;
}

/** Strip server-wrapped prompt prefixes so the stored prompt renders as the user typed it. */
export function stripPromptWrapping(text: string): string {
  let cleaned = text.replace(TRACE_INTERNAL_RE, "");
  cleaned = cleaned.replace(CONVERSATION_HISTORY_RE, "");
  if (cleaned.startsWith(PLAN_PREFIX)) {
    cleaned = cleaned.slice(PLAN_PREFIX.length);
  }
  return cleaned.trim();
}
