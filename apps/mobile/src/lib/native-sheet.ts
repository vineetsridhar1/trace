import { Platform } from "react-native";

const NATIVE_EXPO_SHEET_MIN_IOS_MAJOR = 16;
const loggedSurfaces = new Set<string>();

interface NativeSheetDecision {
  majorVersion: number | null;
  platform: typeof Platform.OS;
  useNative: boolean;
  version: string | number;
}

export function getNativeSheetDecision(): NativeSheetDecision {
  const majorVersion =
    typeof Platform.Version === "string"
      ? Number.parseInt(Platform.Version, 10)
      : Math.floor(Platform.Version);
  const useNative =
    Platform.OS === "ios" &&
    Number.isFinite(majorVersion) &&
    majorVersion >= NATIVE_EXPO_SHEET_MIN_IOS_MAJOR;

  return {
    majorVersion: Number.isFinite(majorVersion) ? majorVersion : null,
    platform: Platform.OS,
    useNative,
    version: Platform.Version,
  };
}

export function shouldUseNativeExpoSheet(): boolean {
  return getNativeSheetDecision().useNative;
}

export function logNativeSheetDecision(surface: string): void {
  if (!__DEV__ || loggedSurfaces.has(surface)) return;
  loggedSurfaces.add(surface);

  const decision = getNativeSheetDecision();
  console.info(
    `[native-sheet] ${surface}: ${decision.useNative ? "native" : "custom"}`,
    {
      majorVersion: decision.majorVersion,
      platform: decision.platform,
      version: decision.version,
    },
  );
}
