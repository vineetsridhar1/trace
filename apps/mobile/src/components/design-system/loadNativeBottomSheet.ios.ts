import type { ComponentType } from "react";
import type { NativeBottomSheetProps } from "./NativeBottomSheet.ios";

type NativeBottomSheetModule = {
  NativeBottomSheet: ComponentType<NativeBottomSheetProps>;
};

let cachedNativeBottomSheet: ComponentType<NativeBottomSheetProps> | null | undefined;

export function loadNativeBottomSheet(): ComponentType<NativeBottomSheetProps> | null {
  if (cachedNativeBottomSheet !== undefined) return cachedNativeBottomSheet;

  try {
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
