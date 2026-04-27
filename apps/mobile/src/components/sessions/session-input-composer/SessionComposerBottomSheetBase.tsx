import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { alpha, useTheme } from "@/theme";

export interface SessionComposerBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onDismissed?: () => void;
  children: ReactNode;
}

const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;

export function SessionComposerBottomSheetBase({
  visible,
  onClose,
  onDismissed,
  children,
}: SessionComposerBottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [content, setContent] = useState(children);
  const [settled, setSettled] = useState(false);
  const translateY = useSharedValue(windowHeight);
  const dragY = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) setContent(children);
  }, [children, visible]);

  const finishClose = useCallback(
    (notifyParent: boolean) => {
      setMounted(false);
      onDismissed?.();
      if (notifyParent) onClose();
    },
    [onClose, onDismissed],
  );

  const animateIn = useCallback(() => {
    setSettled(false);
    dragY.value = 0;
    translateY.value = windowHeight;
    backdropOpacity.value = 0;
    translateY.value = withSpring(0, theme.motion.springs.gentle, (finished) => {
      if (finished) runOnJS(setSettled)(true);
    });
    backdropOpacity.value = withTiming(1, { duration: theme.motion.durations.base });
  }, [
    backdropOpacity,
    dragY,
    theme.motion.durations.base,
    theme.motion.springs.gentle,
    translateY,
    windowHeight,
  ]);

  const animateOut = useCallback(
    (notifyParent: boolean) => {
      setSettled(false);
      translateY.value = translateY.value + dragY.value;
      dragY.value = 0;
      translateY.value = withTiming(
        windowHeight,
        { duration: theme.motion.durations.fast },
        (finished) => {
          if (finished) runOnJS(finishClose)(notifyParent);
        },
      );
      backdropOpacity.value = withTiming(0, { duration: theme.motion.durations.fast });
    },
    [backdropOpacity, dragY, finishClose, theme.motion.durations.fast, translateY, windowHeight],
  );

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    if (mounted) animateOut(false);
  }, [animateOut, mounted, visible]);

  useEffect(() => {
    if (!mounted || !visible) return;
    animateIn();
  }, [animateIn, mounted, visible]);

  const requestClose = useCallback(() => {
    if (!mounted) return;
    animateOut(true);
  }, [animateOut, mounted]);

  const handlePanEnd = useCallback(() => {
    requestClose();
  }, [requestClose]);

  const sheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((event) => {
          dragY.value = Math.max(event.translationY, 0);
        })
        .onEnd((event) => {
          const shouldClose = dragY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY;
          if (shouldClose) {
            runOnJS(handlePanEnd)();
            return;
          }
          dragY.value = withSpring(0, theme.motion.springs.smooth);
        }),
    [dragY, handlePanEnd, theme.motion.springs.smooth],
  );

  const backdropStyle = useAnimatedStyle(() => {
    const dragFactor = Math.max(0.65, 1 - dragY.value / 260);
    return {
      opacity: backdropOpacity.value * dragFactor,
    };
  });

  const sheetStyle = useAnimatedStyle(() => {
    const offset = translateY.value + dragY.value;
    if (settled && Math.abs(offset) < 0.5) return {};
    return {
      transform: [{ translateY: offset }],
    };
  }, [settled]);

  if (!mounted) return null;

  return (
    <Modal
      visible
      animationType="none"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={requestClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Animated.View
          style={[styles.backdrop, { backgroundColor: alpha("#000000", 0.32) }, backdropStyle]}
        >
          <Pressable
            accessibilityLabel="Dismiss composer picker"
            onPress={requestClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderMuted,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
              paddingTop: theme.spacing.sm,
            },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={sheetGesture}>
            <View style={styles.grabberSlot}>
              <View style={[styles.grabber, { backgroundColor: theme.colors.borderMuted }]} />
            </View>
          </GestureDetector>
          <View style={[styles.content, { paddingHorizontal: theme.spacing.lg }]}>{content}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    maxHeight: "78%",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  grabberSlot: {
    alignItems: "center",
    paddingBottom: 10,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 999,
  },
  content: {
    minHeight: 0,
    flexShrink: 1,
  },
});
