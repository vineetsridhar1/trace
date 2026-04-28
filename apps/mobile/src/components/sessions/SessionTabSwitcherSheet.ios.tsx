import { getIOSMajorVersion, isIOS26OrLater } from "@/lib/ios-version";
import { SessionTabSwitcherNativeSheet } from "./SessionTabSwitcherNativeSheet.ios";
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

  if (!ios26OrLater) {
    logTabSwitcherSheetFallback("not ios 26 or later");
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
    <SessionTabSwitcherNativeSheet
      open={open}
      groupId={groupId}
      activeSessionId={activeSessionId}
      activePane={activePane}
      onClose={onClose}
    />
  );
}
