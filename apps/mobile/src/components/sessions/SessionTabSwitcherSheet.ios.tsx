import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { BottomSheet, Host } from "@expo/ui/swift-ui";
import { shouldUseNativeExpoSheet } from "@/lib/native-sheet";
import { SessionTabSwitcherContent } from "./SessionTabSwitcherContent";
import {
  SessionTabSwitcherSheetBase,
  type SessionTabSwitcherSheetProps,
} from "./SessionTabSwitcherSheetBase";

const IOS_SHEET_CLOSE_DELAY_MS = 220;

export function SessionTabSwitcherSheet(props: SessionTabSwitcherSheetProps) {
  if (!shouldUseNativeExpoSheet()) {
    return <SessionTabSwitcherSheetBase {...props} />;
  }

  return <NativeSessionTabSwitcherSheet {...props} />;
}

function NativeSessionTabSwitcherSheet({
  open,
  groupId,
  activeSessionId,
  activePane = "session",
  onClose,
}: SessionTabSwitcherSheetProps) {
  const { height, width } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  const handlePresentedChange = useCallback(
    (isOpened: boolean) => {
      if (isOpened) return;
      setMounted(false);
      onClose();
    },
    [onClose],
  );

  const hostStyle = useMemo(() => [styles.host, { width }], [width]);
  const sheetContentStyle = useMemo(
    () => [styles.sheetContent, { height: Math.round(height * 0.56) }],
    [height],
  );

  if (!mounted) return null;

  return (
    <View style={styles.anchor}>
      <Host style={hostStyle}>
        <BottomSheet
          isOpened={open}
          onIsOpenedChange={handlePresentedChange}
          presentationDetents={["medium", "large"]}
          presentationDragIndicator="visible"
        >
          <View style={sheetContentStyle}>
            <SessionTabSwitcherContent
              groupId={groupId}
              activeSessionId={activeSessionId}
              activePane={activePane}
              onClose={onClose}
              closeDelayMs={IOS_SHEET_CLOSE_DELAY_MS}
              contentInset="sheet"
            />
          </View>
        </BottomSheet>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 1,
    height: 1,
  },
  host: {
    position: "absolute",
    top: 0,
    left: 0,
    height: 1,
  },
  sheetContent: {
    minHeight: 0,
  },
});
