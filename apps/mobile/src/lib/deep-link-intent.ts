let pendingDeepLinkPath: string | null = null;

export function getPendingDeepLinkPath(): string | null {
  return pendingDeepLinkPath;
}

export function setPendingDeepLinkPath(path: string): void {
  pendingDeepLinkPath = path;
}

export function consumePendingDeepLinkPath(): string | null {
  const path = pendingDeepLinkPath;
  pendingDeepLinkPath = null;
  return path;
}
