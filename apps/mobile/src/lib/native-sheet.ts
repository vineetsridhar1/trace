import { Platform } from "react-native";

const NATIVE_EXPO_SHEET_MIN_IOS_MAJOR = 16;

export function shouldUseNativeExpoSheet(): boolean {
  if (Platform.OS !== "ios") return false;

  const majorVersion =
    typeof Platform.Version === "string"
      ? Number.parseInt(Platform.Version, 10)
      : Math.floor(Platform.Version);

  return Number.isFinite(majorVersion) && majorVersion >= NATIVE_EXPO_SHEET_MIN_IOS_MAJOR;
}
