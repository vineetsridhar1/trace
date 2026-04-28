import { loadNativeBottomSheet } from "@/components/design-system/loadNativeBottomSheet.ios";
import { getIOSMajorVersion, isIOS26OrLater } from "@/lib/ios-version";
import {
  SessionComposerBottomSheetBase,
  type SessionComposerBottomSheetProps,
} from "./SessionComposerBottomSheetBase";

export type { SessionComposerBottomSheetProps };

let loggedComposerSheetFallback = false;

function logComposerSheetFallback(reason: string) {
  if (loggedComposerSheetFallback) return;
  loggedComposerSheetFallback = true;
  console.info("[SessionComposerBottomSheet] using custom fallback", {
    reason,
    iosMajorVersion: getIOSMajorVersion(),
  });
}

export function SessionComposerBottomSheet(props: SessionComposerBottomSheetProps) {
  const ios26OrLater = isIOS26OrLater();
  const NativeBottomSheet = ios26OrLater ? loadNativeBottomSheet() : null;

  if (!NativeBottomSheet) {
    logComposerSheetFallback(ios26OrLater ? "native sheet unavailable" : "not ios 26 or later");
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
