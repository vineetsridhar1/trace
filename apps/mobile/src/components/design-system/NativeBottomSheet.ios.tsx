import { useCallback, type ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
  presentationDetents,
  presentationDragIndicator,
  type PresentationDetent,
} from "@expo/ui/swift-ui/modifiers";
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

  const handlePresentedChange = useCallback(
    (isPresented: boolean) => {
      if (isPresented) return;
      onDismissed?.();
      onClose();
    },
    [onClose, onDismissed],
  );

  return (
    <Host colorScheme={theme.scheme === "dark" ? "dark" : "light"} style={[styles.host, { width }]}>
      <BottomSheet isPresented={visible} onIsPresentedChange={handlePresentedChange}>
        <Group modifiers={[presentationDetents(detents), presentationDragIndicator("visible")]}>
          <RNHostView>
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
          </RNHostView>
        </Group>
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
