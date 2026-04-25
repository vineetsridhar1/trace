import { memo, useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { haptic } from "@/lib/haptics";
import { alpha, useTheme } from "@/theme";

interface SessionBrowserRevealEdgeProps {
  topInset: number;
  onOpen: () => void;
}

const OPEN_DISTANCE = 44;
const OPEN_VELOCITY = 700;

export const SessionBrowserRevealEdge = memo(function SessionBrowserRevealEdge({
  topInset,
  onOpen,
}: SessionBrowserRevealEdgeProps) {
  const theme = useTheme();
  const handleOpen = useCallback(() => {
    void haptic.selection();
    onOpen();
  }, [onOpen]);

  const gesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .onEnd((event) => {
      const shouldOpen =
        event.translationX < -OPEN_DISTANCE || event.velocityX < -OPEN_VELOCITY;
      if (shouldOpen) runOnJS(handleOpen)();
    });

  return (
    <GestureDetector gesture={gesture}>
      <View
        pointerEvents="box-only"
        style={[
          styles.hitArea,
          {
            top: topInset,
          },
        ]}
      >
        <View
          style={[
            styles.pill,
            {
              backgroundColor: alpha(theme.colors.surface, 0.92),
              borderColor: alpha(theme.colors.borderMuted, 0.92),
            },
          ]}
        >
          <SymbolView
            name="globe"
            size={14}
            tintColor={theme.colors.mutedForeground}
          />
          <SymbolView
            name="chevron.left"
            size={11}
            tintColor={theme.colors.dimForeground}
          />
        </View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  hitArea: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 28,
    justifyContent: "center",
    alignItems: "flex-end",
    zIndex: 4,
  },
  pill: {
    width: 20,
    height: 64,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
});
