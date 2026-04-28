import { loadNativeBottomSheet } from "@/components/design-system/loadNativeBottomSheet.ios";
import { getIOSMajorVersion, isIOS26OrLater } from "@/lib/ios-version";
import { SessionTabSwitcherContent } from "./SessionTabSwitcherContent";
import {
  SessionTabSwitcherSheetBase,
  type SessionTabSwitcherSheetProps,
} from "./SessionTabSwitcherSheetBase";

export type { SessionTabSwitcherSheetProps };

let loggedTabSwitcherSheetFallback = false;

function logTabSwitcherSheetFallback(reason: string) {
  if (loggedTabSwitcherSheetFallback) return;
  loggedTabSwitcherSheetFallback = true;
  console.info("[SessionTabSwitcherSheet] using custom fallback", {
    reason,
    iosMajorVersion: getIOSMajorVersion(),
  });
}

export function SessionTabSwitcherSheet({
  open,
  groupId,
  activeSessionId,
  activePane = "session",
  onClose,
}: SessionTabSwitcherSheetProps) {
  const ios26OrLater = isIOS26OrLater();
  const NativeBottomSheet = ios26OrLater ? loadNativeBottomSheet() : null;

  if (!NativeBottomSheet) {
    logTabSwitcherSheetFallback(ios26OrLater ? "native sheet unavailable" : "not ios 26 or later");
    return (
      <SessionTabSwitcherSheetBase
        open={open}
        groupId={groupId}
        activeSessionId={activeSessionId}
        activePane={activePane}
        onClose={onClose}
      />
    );
  }

  return (
    <NativeBottomSheet visible={open} onClose={onClose} detents={["large"]}>
      <SessionTabSwitcherContent
        groupId={groupId}
        activeSessionId={activeSessionId}
        activePane={activePane}
        onClose={onClose}
      />
    </NativeBottomSheet>
  );
}
