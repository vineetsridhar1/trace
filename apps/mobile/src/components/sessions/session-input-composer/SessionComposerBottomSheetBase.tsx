import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { alpha, useTheme } from "@/theme";

export interface SessionComposerBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onDismissed?: () => void;
  children: ReactNode;
}

export function SessionComposerBottomSheetBase({
  visible,
  onClose,
  onDismissed,
  children,
}: SessionComposerBottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [content, setContent] = useState(children);
  const sheetRef = useRef<BottomSheetModal>(null);
  const visibleRef = useRef(visible);

  const maxDynamicContentSize = Math.round(windowHeight * 0.78);

  useEffect(() => {
    if (visible) setContent(children);
  }, [children, visible]);

  const backdropComponent = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        accessibilityLabel="Dismiss composer picker"
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
    const shouldNotifyParent = visibleRef.current;
    visibleRef.current = false;
    onDismissed?.();
    if (shouldNotifyParent) onClose();
  }, [onClose, onDismissed]);

  const backgroundStyle = useMemo(
    () => ({
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.borderMuted,
      borderTopWidth: StyleSheet.hairlineWidth,
    }),
    [theme.colors.borderMuted, theme.colors.surface],
  );

  useEffect(() => {
    visibleRef.current = visible;
    if (visible) {
      sheetRef.current?.present();
      return;
    }
    sheetRef.current?.dismiss();
  }, [visible]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      backdropComponent={backdropComponent}
      backgroundStyle={backgroundStyle}
      bottomInset={insets.bottom}
      enableDynamicSizing
      enablePanDownToClose
      handleIndicatorStyle={{ backgroundColor: theme.colors.borderMuted }}
      maxDynamicContentSize={maxDynamicContentSize}
      onDismiss={handleDismiss}
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
        {content}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    minHeight: 0,
  },
});
