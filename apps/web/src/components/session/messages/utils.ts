export function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function stripMatchingQuotes(text: string): string {
  if (text.length < 2) return text;
  const first = text[0];
  const last = text[text.length - 1];
  if ((first === "'" || first === "\"") && last === first) {
    return text.slice(1, -1);
  }
  return text;
}

export function formatCommandLabel(command: string): string {
  const trimmed = command.trim();
  const shellWrapper = trimmed.match(
    /^(?:\/bin\/)?(?:zsh|bash|sh)\s+-lc\s+([\s\S]+)$/i,
  );

  if (!shellWrapper) return trimmed;

  const inner = stripMatchingQuotes(shellWrapper[1].trim());
  return inner || trimmed;
}

/** Truncate text with ellipsis */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** Safely serialize unknown data for display */
export function serializeUnknown(value: unknown, maxLen = 2000): string {
  try {
    const str = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return truncate(str, maxLen);
  } catch {
    return String(value);
  }
}
