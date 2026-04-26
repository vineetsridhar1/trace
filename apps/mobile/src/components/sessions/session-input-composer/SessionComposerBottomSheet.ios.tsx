import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { BottomSheet, Host } from "@expo/ui/swift-ui";
import { shouldUseNativeExpoSheet } from "@/lib/native-sheet";
import { useTheme } from "@/theme";
import {
  SessionComposerBottomSheetBase,
  type SessionComposerBottomSheetProps,
} from "./SessionComposerBottomSheetBase";

export function SessionComposerBottomSheet(props: SessionComposerBottomSheetProps) {
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
  const theme = useTheme();
  const { height, width } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [content, setContent] = useState(children);

  useEffect(() => {
    if (visible) {
      setContent(children);
      setMounted(true);
    }
  }, [children, visible]);

  const handlePresentedChange = useCallback(
    (isOpened: boolean) => {
      if (isOpened) return;
      setMounted(false);
      onDismissed?.();
      if (visible) onClose();
    },
    [onClose, onDismissed, visible],
  );

  const hostStyle = useMemo(() => [styles.host, { width }], [width]);
  const sheetContentStyle = useMemo(
    () => [
      styles.sheetContent,
      {
        height: Math.round(height * 0.72),
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
      },
    ],
    [height, theme.spacing.lg, theme.spacing.sm],
  );

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
          <View style={sheetContentStyle}>{content}</View>
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
