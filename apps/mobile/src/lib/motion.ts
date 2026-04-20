import { useEffect } from "react";
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { motion } from "@/theme";

export const springs = motion.springs;
export const durations = motion.durations;

const PRESSED_SCALE = 0.97;

export function usePressScale(toScale = PRESSED_SCALE) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  function onPressIn() {
    scale.value = withSpring(toScale, springs.snap);
  }
  function onPressOut() {
    scale.value = withSpring(1, springs.snap);
  }
  return { animatedStyle, onPressIn, onPressOut };
}

export function useFadeInFromBottom(delay = 0) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: durations.base }));
    translateY.value = withDelay(delay, withSpring(0, springs.smooth));
  }, [delay, opacity, translateY]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
}

export function usePulse(duration = 800) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.4, { duration, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [duration, opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

export function useSlideInFromRight() {
  const translateX = useSharedValue(40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateX.value = withSpring(0, springs.smooth);
    opacity.value = withTiming(1, { duration: durations.fast });
  }, [opacity, translateX]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));
}
