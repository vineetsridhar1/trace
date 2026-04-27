function notificationRoute(path: string): string | null {
  if (path.startsWith("/sessions/")) return path;
  if (path === "/connections" || path === "/(connections)") return "/(connections)";
  return null;
}

export function sessionIdFromNotificationLink(deepLink: string): string | null {
  const path = routePathFromNotificationLink(deepLink);
  if (!path?.startsWith("/sessions/")) return null;
  const parts = path.split("/");
  return parts.length >= 4 && parts[3] ? parts[3] : null;
}

export function routePathFromNotificationLink(deepLink: string): string | null {
  if (deepLink.startsWith("/")) return notificationRoute(deepLink);

  try {
    const url = new URL(deepLink);
    if (url.protocol === "trace:") {
      const host = url.hostname ? `/${url.hostname}` : "";
      return notificationRoute(`${host}${url.pathname}${url.search}`);
    }
    if (url.protocol === "https:" && url.hostname === "gettrace.org") {
      const path = url.pathname.startsWith("/m/")
        ? `${url.pathname.slice(2)}${url.search}`
        : `${url.pathname}${url.search}`;
      return notificationRoute(path);
    }
  } catch {
    return null;
  }

  return null;
}

export function deepLinkFromNotificationData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const deepLink = (data as Record<string, unknown>).deepLink;
  return typeof deepLink === "string" && deepLink.length > 0 ? deepLink : null;
}
