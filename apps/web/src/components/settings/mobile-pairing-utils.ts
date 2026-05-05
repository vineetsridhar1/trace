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

export function normalizePairingPublicUrl(value: string): string {
  const trimmed = value.trim();
  if (!/^https?:\/\//.test(trimmed)) {
    throw new Error("Public URL must start with http:// or https://");
  }
  return trimmed.replace(/\/+$/, "");
}

export function mobileDeviceLabel(device: MobileDevice): string {
  if (device.deviceName?.trim()) return device.deviceName;
  if (device.platform === "ios") return "iPhone";
  if (device.platform === "android") return "Android device";
  return `Install ${device.installId.slice(0, 8)}`;
}
