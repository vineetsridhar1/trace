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

function hasRequiredExpoUIExports(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const swiftUI = require("@expo/ui/swift-ui") as ExpoUISwiftUIModule;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const modifiers = require("@expo/ui/swift-ui/modifiers") as ExpoUIModifiersModule;

  return (
    swiftUI.BottomSheet != null &&
    swiftUI.Group != null &&
    swiftUI.Host != null &&
    swiftUI.RNHostView != null &&
    typeof modifiers.createModifier === "function"
  );
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
    console.warn("[NativeBottomSheet] Expo UI unavailable", error);
    cachedNativeBottomSheet = null;
    return null;
  }
}
