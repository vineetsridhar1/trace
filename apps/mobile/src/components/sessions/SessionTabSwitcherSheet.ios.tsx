import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { BottomSheet, Host } from "@expo/ui/swift-ui";
import { SessionTabSwitcherContent } from "./SessionTabSwitcherContent";

interface SessionTabSwitcherSheetProps {
  open: boolean;
  groupId: string;
  activeSessionId: string;
  onClose: () => void;
}

const IOS_SHEET_CLOSE_DELAY_MS = 220;
export function SessionTabSwitcherSheet({
  open,
  groupId,
  activeSessionId,
  onClose,
}: SessionTabSwitcherSheetProps) {
  const { width } = useWindowDimensions();
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
          <View style={styles.sheetContent}>
            <SessionTabSwitcherContent
              groupId={groupId}
              activeSessionId={activeSessionId}
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
    flex: 1,
    minHeight: 0,
  },
});
