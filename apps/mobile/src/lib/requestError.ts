function rawMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong.";
}

function matches(error: unknown, patterns: RegExp[]): boolean {
  const message = rawMessage(error);
  return patterns.some((pattern) => pattern.test(message));
}

export function isRateLimitError(error: unknown): boolean {
  return matches(error, [/429/, /too many requests/i, /rate limit/i]);
}

export function isOfflineError(error: unknown): boolean {
  return matches(error, [
    /network request failed/i,
    /network error/i,
    /fetch failed/i,
    /offline/i,
    /internet/i,
    /socket closed/i,
  ]);
}

export function userFacingError(error: unknown, fallback: string): string {
  if (isRateLimitError(error)) return "Too many requests. Try again shortly.";
  if (isOfflineError(error)) return "No internet connection. Try again once you're back online.";
  const message = rawMessage(error).trim();
  return message.length > 0 ? message : fallback;
}
