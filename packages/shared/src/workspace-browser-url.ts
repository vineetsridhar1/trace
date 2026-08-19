/**
 * The workspace browser accepts web URLs only. The rule is enforced twice —
 * once in the service that records the open request, and again in the Electron
 * main process that actually navigates — so it lives here to keep the two
 * sides from drifting apart.
 */

export class WorkspaceBrowserUrlError extends Error {}

/** Normalize a user- or agent-supplied address, defaulting a bare host to HTTPS. */
export function normalizeWorkspaceBrowserUrl(value: string): string {
  const input = value.trim();
  if (!input) throw new WorkspaceBrowserUrlError("Browser URL is required");
  if (input === "about:blank") return input;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input)
    ? input
    : `${isLocalDevelopmentAddress(input) ? "http" : "https"}://${input}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new WorkspaceBrowserUrlError("Browser URL is invalid");
  }
  if (!isWorkspaceBrowserScheme(url)) {
    throw new WorkspaceBrowserUrlError("Browser URL must use HTTP or HTTPS");
  }
  return url.toString();
}

/**
 * Whether an already-formed URL may be loaded in the workspace browser.
 * `about:blank` is permitted because it is the browser's own empty state.
 */
export function isWorkspaceBrowserUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return isWorkspaceBrowserScheme(url) || url.href === "about:blank";
  } catch {
    return false;
  }
}

function isWorkspaceBrowserScheme(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}

function isLocalDevelopmentAddress(value: string): boolean {
  return (
    /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(?::\d+)?(?:[/?#]|$)/i.test(value) ||
    /^\[::1\](?::\d+)?(?:[/?#]|$)/i.test(value)
  );
}
