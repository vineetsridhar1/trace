export type MobileDevice = {
  id: string;
  installId: string;
  deviceName?: string | null;
  platform?: "ios" | "android" | null;
  appVersion?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
};

export function formatMobilePairingDate(value?: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

export function normalizePairingPublicUrl(
  value: string,
  options: { allowLocalHttp?: boolean } = {},
): string {
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Enter a valid public URL");
  }
  if (
    url.protocol !== "https:" &&
    !(options.allowLocalHttp && url.protocol === "http:" && isLocalNetworkHostname(url.hostname))
  ) {
    throw new Error("Public URL must start with https:// unless it is a local network URL");
  }
  if (isLoopbackPairingUrl(trimmed)) {
    throw new Error("Use a URL your phone can reach, not localhost");
  }
  return trimmed.replace(/\/+$/, "");
}

export function isLocalNetworkHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.endsWith(".local")) return true;
  if (normalized === "::1") return false;
  if (
    normalized.includes(":") &&
    (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:"))
  ) {
    return true;
  }

  const parts = normalized.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function isLoopbackPairingUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

export function mobileDeviceLabel(device: MobileDevice): string {
  if (device.deviceName?.trim()) return device.deviceName;
  if (device.platform === "ios") return "iPhone";
  if (device.platform === "android") return "Android device";
  return `Install ${device.installId.slice(0, 8)}`;
}
