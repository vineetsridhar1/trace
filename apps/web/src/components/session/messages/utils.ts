export function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
