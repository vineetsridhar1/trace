const CONNECTION_ERROR_MESSAGES: Record<string, string> = {
  idle_session_group_cleanup:
    "This session's runtime was shut down after being idle. Retry to reconnect, or move it to another runtime.",
  runtime_disconnected:
    "The runtime disconnected. Retry to reconnect, or move this session to another runtime.",
};

const INTERNAL_REASON_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;

export function formatSessionConnectionError(message: string | null | undefined): string | null {
  const trimmed = message?.trim();
  if (!trimmed) return null;

  const mapped = CONNECTION_ERROR_MESSAGES[trimmed];
  if (mapped) return mapped;

  if (INTERNAL_REASON_PATTERN.test(trimmed)) {
    return "The runtime disconnected unexpectedly. Retry to reconnect, or move this session to another runtime.";
  }

  return trimmed;
}
