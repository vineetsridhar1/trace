import { useCallback, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import { BottomSheet, Host, type PresentationDetent } from "@expo/ui/swift-ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme";

export interface NativeBottomSheetProps {
  visible: boolean;
  children: ReactNode;
  detents?: PresentationDetent[];
  onClose: () => void;
  onDismissed?: () => void;
  contentStyle?: ViewStyle;
}

const DEFAULT_DETENTS: PresentationDetent[] = ["medium", "large"];

export function NativeBottomSheet({
  visible,
  children,
  detents = DEFAULT_DETENTS,
  onClose,
  onDismissed,
  contentStyle,
}: NativeBottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const handleOpenedChange = useCallback(
    (isOpened: boolean) => {
      if (isOpened) return;
      onDismissed?.();
      onClose();
    },
    [onClose, onDismissed],
  );

  return (
    <Host colorScheme={theme.scheme === "dark" ? "dark" : "light"} style={[styles.host, { width }]}>
      <BottomSheet
        isOpened={visible}
        onIsOpenedChange={handleOpenedChange}
        presentationDetents={detents}
        presentationDragIndicator="visible"
      >
        <View
          style={[
            styles.content,
            {
              backgroundColor: theme.colors.surfaceDeep,
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.lg,
              paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
            },
            contentStyle,
          ]}
        >
          {children}
        </View>
      </BottomSheet>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 1,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
});
