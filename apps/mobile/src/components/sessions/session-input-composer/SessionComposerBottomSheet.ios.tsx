import { loadNativeBottomSheet } from "@/components/design-system/loadNativeBottomSheet.ios";
import { isIOS26OrLater } from "@/lib/ios-version";
import {
  SessionComposerBottomSheetBase,
  type SessionComposerBottomSheetProps,
} from "./SessionComposerBottomSheetBase";

export type { SessionComposerBottomSheetProps };

export function SessionComposerBottomSheet(props: SessionComposerBottomSheetProps) {
  const NativeBottomSheet = isIOS26OrLater() ? loadNativeBottomSheet() : null;

  if (!NativeBottomSheet) {
    return <SessionComposerBottomSheetBase {...props} />;
  }

  return (
    <NativeBottomSheet
      visible={props.visible}
      onClose={props.onClose}
      onDismissed={props.onDismissed}
    >
      {props.children}
    </NativeBottomSheet>
  );
}
