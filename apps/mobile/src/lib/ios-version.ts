import { Platform } from "react-native";

function getIOSMajorVersion(): number | null {
  if (Platform.OS !== "ios") return null;

  const version = Platform.Version;
  if (typeof version === "number") return Math.floor(version);

  const major = Number.parseInt(version.split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : null;
}

export function isIOS26OrLater(): boolean {
  const major = getIOSMajorVersion();
  return major != null && major >= 26;
}
