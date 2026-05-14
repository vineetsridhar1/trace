import { useCallback, useEffect, useState } from "react";
import { router, usePathname } from "expo-router";
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useShallow } from "zustand/react/shallow";
import {
  useAuthStore,
  useEntityStore,
  type AuthState,
  type EntityState,
} from "@trace/client-core";
import { Text } from "@/components/design-system/Text";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { haptic } from "@/lib/haptics";
import { selectOwnedActiveSessionIds } from "@/lib/activeSessions";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme } from "@/theme";
import { ActiveSessionsAccessoryRow } from "./ActiveSessionsAccessoryRow";

export function ActiveSessionsAccessory() {
  const pathname = usePathname();
  const userId = useAuthStore((s: AuthState) => s.user?.id ?? null);
  const ids = useEntityStore(
    useShallow((state: EntityState) => selectOwnedActiveSessionIds(state, userId)),
  );
  const index = useMobileUIStore((s) => s.activeAccessoryIndex);
  const setIndex = useMobileUIStore((s) => s.setActiveAccessoryIndex);
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const shakeX = useSharedValue(0);
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth((prev) => (prev === w ? prev : w));
  }, []);

  // Clamp the shared index whenever the list shrinks beneath it.
  useEffect(() => {
    if (ids.length === 0) {
      if (index !== 0) setIndex(0);
      return;
    }
    const max = ids.length - 1;
    if (index > max) setIndex(max);
  }, [ids.length, index, setIndex]);

  const isChannelsIndex = pathname === "/channels" || pathname === "/channels/";

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const promptForChannel = useCallback(() => {
    void haptic.warning();
    if (reducedMotion) return;
    shakeX.value = withSequence(
      withTiming(-8, { duration: 45 }),
      withTiming(8, { duration: 45 }),
      withTiming(-6, { duration: 45 }),
      withTiming(6, { duration: 45 }),
      withTiming(0, { duration: 45 }),
    );
  }, [reducedMotion, shakeX]);

  const handleStartSession = useCallback(() => {
    if (isChannelsIndex) {
      promptForChannel();
      return;
    }
    void haptic.light();
    router.push("/channels" as never);
  }, [isChannelsIndex, promptForChannel]);

  if (ids.length === 0) {
    return (
      <Animated.View style={[styles.emptyActionFrame, shakeStyle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start a session"
          accessibilityHint={isChannelsIndex ? "Select a channel first." : undefined}
          style={styles.emptyAction}
          onPress={handleStartSession}
        >
          <Text variant="callout" color="foreground" style={styles.emptyLabel}>
            Start a session
          </Text>
        </Pressable>
      </Animated.View>
    );
  }

  const visibleIndex = Math.min(index, ids.length - 1);
  const sessionId = ids[visibleIndex];
  if (!sessionId) return null;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {width > 0 ? (
        <ActiveSessionsAccessoryRow sessionId={sessionId} width={width} theme={theme} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyActionFrame: {
    flex: 1,
  },
  emptyAction: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  emptyLabel: { fontWeight: "600" },
});
