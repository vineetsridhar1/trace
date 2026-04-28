export type StartSessionAccessoryTarget =
  | { kind: "channel"; channelId: string }
  | { kind: "channel_list" }
  | { kind: "elsewhere" };

export function getStartSessionAccessoryTarget(pathname: string): StartSessionAccessoryTarget {
  if (pathname === "/channels" || pathname === "/channels/") {
    return { kind: "channel_list" };
  }

  const match = /^\/channels\/([^/]+)/.exec(pathname);
  if (match?.[1]) {
    return { kind: "channel", channelId: decodeURIComponent(match[1]) };
  }

  return { kind: "elsewhere" };
}
