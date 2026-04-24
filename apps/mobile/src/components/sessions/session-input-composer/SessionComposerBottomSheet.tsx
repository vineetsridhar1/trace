import { useEffect, useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { alpha, useTheme } from "@/theme";

interface SessionComposerBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function SessionComposerBottomSheet({
  visible,
  onClose,
  children,
}: SessionComposerBottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [content, setContent] = useState(children);
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (visible) setContent(children);
  }, [children, visible]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withSpring(1, theme.motion.springs.gentle);
      return;
    }

    progress.value = withTiming(
      0,
      { duration: theme.motion.durations.fast },
      (finished) => {
        if (finished) runOnJS(setMounted)(false);
      },
    );
  }, [progress, theme.motion.durations.fast, theme.motion.springs.gentle, visible]);

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
  }));

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.92, 1]),
    transform: [
      {
        translateY: interpolate(progress.value, [0, 1], [36, 0]),
      },
    ],
  }));

  if (!mounted) return null;

  const maxHeight = Math.max(
    280,
    window.height - insets.top - theme.spacing.xl * 2,
  );

  return (
    <Modal
      transparent
      visible={mounted}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalRoot}>
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: alpha(theme.colors.background, 0.58),
            },
            backdropAnimatedStyle,
          ]}
        />
        <Pressable
          accessibilityLabel="Dismiss sheet"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          pointerEvents="box-none"
          style={[
            styles.sheetHost,
            {
              paddingTop: theme.spacing.xl,
              paddingHorizontal: theme.spacing.md,
              paddingBottom: insets.bottom + theme.spacing.sm,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.sheet,
              theme.shadows.lg,
              {
                maxHeight,
                borderRadius: theme.radius.xl,
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.borderMuted,
              },
              sheetAnimatedStyle,
            ]}
          >
            <View style={styles.handleSlot}>
              <View
                style={[
                  styles.handle,
                  {
                    backgroundColor: alpha(theme.colors.foreground, 0.22),
                  },
                ]}
              />
            </View>
            <View
              style={[
                styles.content,
                {
                  paddingHorizontal: theme.spacing.lg,
                  paddingBottom: theme.spacing.lg,
                },
              ]}
            >
              {content}
            </View>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  sheetHost: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  handleSlot: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 999,
  },
  content: {
    minHeight: 0,
    flexShrink: 1,
    paddingTop: 4,
  },
});
