import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { BottomSheet, Host } from "@expo/ui/swift-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { shouldUseNativeExpoSheet } from "@/lib/native-sheet";
import { useTheme } from "@/theme";
import {
  SessionComposerBottomSheetBase,
  type SessionComposerBottomSheetProps,
} from "./SessionComposerBottomSheetBase";

const SHEET_HEIGHT_RATIO = 0.78;

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
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [content, setContent] = useState(children);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setContent(children);
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
        backgroundColor: theme.colors.surface,
        height: Math.round(height * SHEET_HEIGHT_RATIO),
        paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
      },
    ],
    [height, insets.bottom, theme.colors.surface, theme.spacing.lg, theme.spacing.sm],
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

export type { SessionComposerBottomSheetProps };

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
