import { useCallback, useMemo, useRef } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { BottomSheet, Host } from "@expo/ui/swift-ui";
import { SessionTabSwitcherContent } from "./SessionTabSwitcherContent";

interface SessionTabSwitcherSheetProps {
  open: boolean;
  groupId: string;
  activeSessionId: string;
  onClose: () => void;
}

export function SessionTabSwitcherSheet({
  open,
  groupId,
  activeSessionId,
  onClose,
}: SessionTabSwitcherSheetProps) {
  const { width, height } = useWindowDimensions();
  const pendingActionRef = useRef<(() => void) | null>(null);

  const handlePresentedChange = useCallback(
    (isPresented: boolean) => {
      if (isPresented === open) return;
      onClose();
      if (isPresented) return;
      pendingActionRef.current?.();
      pendingActionRef.current = null;
    },
    [onClose, open],
  );

  const requestClose = useCallback(
    (afterClose?: () => void) => {
      pendingActionRef.current = afterClose ?? null;
      onClose();
    },
    [onClose],
  );

  const anchorStyle = useMemo(() => [styles.anchor, { width, height }], [height, width]);
  const hostStyle = useMemo(() => [styles.host, { width, height }], [height, width]);
  const contentHostStyle = useMemo(() => [styles.contentHost, { width }], [width]);

  return (
    <View pointerEvents="box-none" style={anchorStyle}>
      <Host style={hostStyle} useViewportSizeMeasurement>
        <BottomSheet
          isOpened={open}
          onIsOpenedChange={handlePresentedChange}
          presentationDetents={["medium", "large"]}
          presentationDragIndicator="visible"
        >
          <Host matchContents={{ vertical: true }} style={contentHostStyle}>
            <View style={styles.sheetContent}>
              <SessionTabSwitcherContent
                groupId={groupId}
                activeSessionId={activeSessionId}
                requestClose={requestClose}
                contentInset="sheet"
              />
            </View>
          </Host>
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
  },
  host: {
    flex: 1,
  },
  contentHost: {
    minHeight: 0,
  },
  sheetContent: {
    flex: 1,
    minHeight: 0,
  },
});
