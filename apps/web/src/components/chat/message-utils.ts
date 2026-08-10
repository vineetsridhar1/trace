export function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function textToEditorHtml(text: string): string {
  const safe = escapeHtml(text);
  const withBreaks = safe.replace(/\n/g, "<br />");
  return `<p>${withBreaks || "<br />"}</p>`;
}

/** Removes Quill's required trailing newline without discarding intentional line breaks. */
export function editorTextToMessageText(text: string): string {
  const messageText = text.endsWith("\n") ? text.slice(0, -1) : text;
  return messageText.includes("\n") ? messageText : messageText.trim();
}

export function hasMessageContent(text: string): boolean {
  return text.trim().length > 0 || text.includes("\n");
}
