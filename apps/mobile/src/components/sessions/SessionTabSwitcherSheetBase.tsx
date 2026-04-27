import { useCallback, useEffect, useMemo, useState } from "react";
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
import { SessionTabSwitcherContent } from "./SessionTabSwitcherContent";

export interface SessionTabSwitcherSheetProps {
  open: boolean;
  groupId: string;
  activeSessionId: string;
  activePane?: "session" | "terminal" | "browser";
  onClose: () => void;
}

const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;

export function SessionTabSwitcherSheetBase({
  open,
  groupId,
  activeSessionId,
  activePane = "session",
  onClose,
}: SessionTabSwitcherSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const translateY = useSharedValue(windowHeight);
  const dragY = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);

  const finishClose = useCallback(
    (notifyParent: boolean) => {
      setMounted(false);
      if (notifyParent) onClose();
    },
    [onClose],
  );

  const animateIn = useCallback(() => {
    dragY.value = 0;
    translateY.value = windowHeight;
    backdropOpacity.value = 0;
    translateY.value = withSpring(0, theme.motion.springs.gentle);
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
    if (open) {
      setMounted(true);
      return;
    }
    if (mounted) animateOut(false);
  }, [animateOut, mounted, open]);

  useEffect(() => {
    if (!mounted || !open) return;
    animateIn();
  }, [animateIn, mounted, open]);

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

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
  }));

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
            accessibilityLabel="Dismiss tab switcher"
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
              height: windowHeight,
              paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
              paddingTop: Math.max(insets.top, theme.spacing.sm),
            },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={sheetGesture}>
            <View style={styles.grabberSlot}>
              <View style={[styles.grabber, { backgroundColor: theme.colors.borderMuted }]} />
            </View>
          </GestureDetector>
          <View style={[styles.content, { paddingHorizontal: theme.spacing.lg }]}>
            <SessionTabSwitcherContent
              groupId={groupId}
              activeSessionId={activeSessionId}
              activePane={activePane}
              onClose={requestClose}
            />
          </View>
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
    flex: 1,
    minHeight: 0,
  },
});
