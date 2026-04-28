import { loadNativeBottomSheet } from "@/components/design-system/loadNativeBottomSheet.ios";
import { isIOS26OrLater } from "@/lib/ios-version";
import { SessionTabSwitcherContent } from "./SessionTabSwitcherContent";
import {
  SessionTabSwitcherSheetBase,
  type SessionTabSwitcherSheetProps,
} from "./SessionTabSwitcherSheetBase";

export type { SessionTabSwitcherSheetProps };

export function SessionTabSwitcherSheet({
  open,
  groupId,
  activeSessionId,
  activePane = "session",
  onClose,
}: SessionTabSwitcherSheetProps) {
  const NativeBottomSheet = isIOS26OrLater() ? loadNativeBottomSheet() : null;

  if (!NativeBottomSheet) {
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
