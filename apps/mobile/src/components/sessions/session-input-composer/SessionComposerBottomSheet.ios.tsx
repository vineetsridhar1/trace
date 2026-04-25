import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { BottomSheet, Host } from "@expo/ui/swift-ui";
import { logNativeSheetDecision, shouldUseNativeExpoSheet } from "@/lib/native-sheet";
import {
  SessionComposerBottomSheetBase,
  type SessionComposerBottomSheetProps,
} from "./SessionComposerBottomSheetBase";

export function SessionComposerBottomSheet(props: SessionComposerBottomSheetProps) {
  logNativeSheetDecision("composer");

  if (!shouldUseNativeExpoSheet()) {
    return <SessionComposerBottomSheetBase {...props} />;
  }

  return <NativeSessionComposerBottomSheet {...props} />;
}

function NativeSessionComposerBottomSheet({
  visible,
  onClose,
  onDismissed,
  children,
}: SessionComposerBottomSheetProps) {
  const { width } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [content, setContent] = useState(children);

  useEffect(() => {
    if (visible) {
      setContent(children);
      setMounted(true);
    }
  }, [children, visible]);

  useEffect(() => {
    if (visible || !mounted) return;
    setMounted(false);
    onDismissed?.();
  }, [mounted, onDismissed, visible]);

  const handlePresentedChange = useCallback(
    (isOpened: boolean) => {
      if (isOpened) return;
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
          isOpened={visible}
          onIsOpenedChange={handlePresentedChange}
          presentationDetents={["medium", "large"]}
          presentationDragIndicator="visible"
        >
          <View style={styles.sheetContent}>{content}</View>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
});
