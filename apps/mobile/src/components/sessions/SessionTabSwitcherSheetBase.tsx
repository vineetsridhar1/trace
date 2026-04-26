import { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { alpha, useTheme } from "@/theme";
import { SessionTabSwitcherContent } from "./SessionTabSwitcherContent";

export interface SessionTabSwitcherSheetProps {
  open: boolean;
  groupId: string;
  activeSessionId: string;
  activePane?: "session" | "terminal" | "browser";
  onClose: () => void;
}

export function SessionTabSwitcherSheetBase({
  open,
  groupId,
  activeSessionId,
  activePane = "session",
  onClose,
}: SessionTabSwitcherSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const openRef = useRef(open);
  const snapPoints = useMemo(() => ["42%", "78%"], []);

  const backdropComponent = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        accessibilityLabel="Dismiss tab switcher"
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.32}
        pressBehavior="close"
        style={[
          props.style,
          { backgroundColor: alpha("#000000", 1) },
        ]}
      />
    ),
    [],
  );

  const handleDismiss = useCallback(() => {
    const shouldNotifyParent = openRef.current;
    openRef.current = false;
    if (shouldNotifyParent) onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    sheetRef.current?.dismiss();
  }, []);

  const backgroundStyle = useMemo(
    () => ({
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderMuted,
      borderTopWidth: StyleSheet.hairlineWidth,
    }),
    [theme.colors.borderMuted, theme.colors.surface],
  );

  useEffect(() => {
    openRef.current = open;
    if (open) {
      sheetRef.current?.present();
      return;
    }
    sheetRef.current?.dismiss();
  }, [open]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      backdropComponent={backdropComponent}
      backgroundStyle={backgroundStyle}
      bottomInset={insets.bottom}
      enablePanDownToClose
      handleIndicatorStyle={{ backgroundColor: theme.colors.borderMuted }}
      index={0}
      onDismiss={handleDismiss}
      snapPoints={snapPoints}
      stackBehavior="replace"
    >
      <BottomSheetView
        style={[
          styles.content,
          {
            paddingBottom: theme.spacing.lg,
            paddingHorizontal: theme.spacing.lg,
          },
        ]}
      >
        <SessionTabSwitcherContent
          groupId={groupId}
          activeSessionId={activeSessionId}
          activePane={activePane}
          onClose={requestClose}
        />
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    minHeight: 0,
  },
});
