export function routePathFromNotificationLink(deepLink: string): string | null {
  if (deepLink.startsWith("/")) return deepLink;

  try {
    const url = new URL(deepLink);
    if (url.protocol === "trace:") {
      const host = url.hostname ? `/${url.hostname}` : "";
      return `${host}${url.pathname}${url.search}`;
    }
    if (url.protocol === "https:" && url.hostname === "trace.app") {
      return url.pathname.startsWith("/m/")
        ? `${url.pathname.slice(2)}${url.search}`
        : `${url.pathname}${url.search}`;
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
