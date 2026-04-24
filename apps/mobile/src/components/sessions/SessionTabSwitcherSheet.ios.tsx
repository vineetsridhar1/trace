import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const [presented, setPresented] = useState(open);
  const pendingActionRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) {
      if (mounted) setPresented(false);
      return;
    }
    setMounted(true);
    setPresented(true);
  }, [mounted, open]);

  const handlePresentedChange = useCallback(
    (isPresented: boolean) => {
      if (isPresented) return;
      setMounted(false);
      onClose();
      pendingActionRef.current?.();
      pendingActionRef.current = null;
    },
    [onClose],
  );

  const requestClose = useCallback(
    (afterClose?: () => void) => {
      pendingActionRef.current = afterClose ?? null;
      setPresented(false);
    },
    [],
  );

  const hostStyle = useMemo(() => [styles.host, { width }], [width]);

  if (!mounted) return null;

  return (
    <View style={styles.anchor}>
      <Host style={hostStyle}>
        <BottomSheet
          isOpened={presented}
          onIsOpenedChange={handlePresentedChange}
          presentationDetents={["medium", "large"]}
          presentationDragIndicator="visible"
        >
          <View style={styles.sheetContent}>
            <SessionTabSwitcherContent
              groupId={groupId}
              activeSessionId={activeSessionId}
              requestClose={requestClose}
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
