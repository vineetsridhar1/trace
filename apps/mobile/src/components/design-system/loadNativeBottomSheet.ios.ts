import type { ComponentType } from "react";
import type { NativeBottomSheetProps } from "./NativeBottomSheet.ios";

type NativeBottomSheetModule = {
  NativeBottomSheet: ComponentType<NativeBottomSheetProps>;
};

type ExpoUISwiftUIModule = {
  BottomSheet?: unknown;
  Group?: unknown;
  Host?: unknown;
  RNHostView?: unknown;
};

type ExpoUIModifiersModule = {
  createModifier?: unknown;
};

let cachedNativeBottomSheet: ComponentType<NativeBottomSheetProps> | null | undefined;
let loggedNativeBottomSheetStatus = false;

function logNativeBottomSheetStatus(reason: string, details?: Record<string, unknown>) {
  if (loggedNativeBottomSheetStatus) return;
  loggedNativeBottomSheetStatus = true;
  console.info("[NativeBottomSheet] native sheet unavailable", { reason, ...details });
}

function hasRequiredExpoUIExports(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const swiftUI = require("@expo/ui/swift-ui") as ExpoUISwiftUIModule;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const modifiers = require("@expo/ui/swift-ui/modifiers") as ExpoUIModifiersModule;

  const exportStatus = {
    BottomSheet: swiftUI.BottomSheet != null,
    Group: swiftUI.Group != null,
    Host: swiftUI.Host != null,
    RNHostView: swiftUI.RNHostView != null,
    createModifier: typeof modifiers.createModifier === "function",
  };
  const available = Object.values(exportStatus).every(Boolean);

  if (!available) {
    logNativeBottomSheetStatus("missing expo-ui exports", exportStatus);
  }

  return available;
}

export function loadNativeBottomSheet(): ComponentType<NativeBottomSheetProps> | null {
  if (cachedNativeBottomSheet !== undefined) return cachedNativeBottomSheet;

  try {
    if (!hasRequiredExpoUIExports()) {
      cachedNativeBottomSheet = null;
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedNativeBottomSheet = (require("./NativeBottomSheet.ios") as NativeBottomSheetModule)
      .NativeBottomSheet;
    return cachedNativeBottomSheet;
  } catch (error) {
    logNativeBottomSheetStatus("require failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    cachedNativeBottomSheet = null;
    return null;
  }
}
