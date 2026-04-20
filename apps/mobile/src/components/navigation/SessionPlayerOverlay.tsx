import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShallow } from "zustand/react/shallow";
import { useEntityStore } from "@trace/client-core";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Glass, IconButton, ListRow, Text } from "@/components/design-system";
import { selectActiveSessionIds } from "@/lib/activeSessions";
import { closeSessionPlayer } from "@/lib/sessionPlayer";
import { haptic } from "@/lib/haptics";
import { useMobileUIStore } from "@/stores/ui";
import { alpha, useTheme } from "@/theme";
import { SessionPlayerRow } from "./SessionPlayerRow";
import { SessionPlayerSelectedCard } from "./SessionPlayerSelectedCard";

export function SessionPlayerOverlay() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const open = useMobileUIStore((s) => s.sessionPlayerOpen);
  const index = useMobileUIStore((s) => s.activeAccessoryIndex);
  const setIndex = useMobileUIStore((s) => s.setActiveAccessoryIndex);
  const ids = useEntityStore(useShallow(selectActiveSessionIds));
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = open
      ? withSpring(1, theme.motion.springs.gentle)
      : withTiming(0, { duration: theme.motion.durations.base });
  }, [open, progress, theme.motion.durations.base, theme.motion.springs.gentle]);

  useEffect(() => {
    if (ids.length === 0 && open) closeSessionPlayer();
  }, [ids.length, open]);

  useEffect(() => {
    if (ids.length === 0) return;
    const max = ids.length - 1;
    if (index > max) setIndex(max);
  }, [ids.length, index, setIndex]);

  const sessionId = ids[index] ?? ids[0] ?? null;

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.42,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.94, 1]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [height, 0]) },
      { scale: interpolate(progress.value, [0, 1], [0.97, 1]) },
    ],
  }));

  if (ids.length === 0 && !open) return null;

  return (
    <Animated.View pointerEvents={open ? "auto" : "none"} style={styles.overlay}>
      <Animated.View
        style={[
          styles.backdrop,
          { backgroundColor: alpha(theme.colors.background, 0.88) },
          backdropStyle,
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close session player"
          onPress={() => {
            void haptic.light();
            closeSessionPlayer();
          }}
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          panelStyle,
          {
            paddingTop: insets.top + theme.spacing.sm,
            paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
            paddingHorizontal: theme.spacing.lg,
          },
        ]}
      >
        <Glass preset="card" style={styles.surface}>
          <View
            style={[
              styles.handle,
              { backgroundColor: alpha(theme.colors.foreground, 0.28) },
            ]}
          />
          <View style={styles.header}>
            <Text variant="headline">Session Player</Text>
            <IconButton
              symbol="xmark"
              size="md"
              color="mutedForeground"
              accessibilityLabel="Close session player"
              onPress={() => closeSessionPlayer()}
            />
          </View>
          {sessionId ? <SessionPlayerSelectedCard sessionId={sessionId} /> : null}
          <Text variant="caption1" color="dimForeground" style={styles.sectionLabel}>
            ACTIVE SESSIONS
          </Text>
          <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.lg }}>
            {ids.map((id, rowIndex) => (
              <SessionPlayerRow
                key={id}
                sessionId={id}
                active={rowIndex === index}
                onPress={() => {
                  if (rowIndex === index) return;
                  void haptic.selection();
                  setIndex(rowIndex);
                }}
              />
            ))}
          </ScrollView>
        </Glass>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    ...StyleSheet.absoluteFillObject,
  },
  surface: {
    flex: 1,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  sectionLabel: {
    marginHorizontal: 16,
    marginBottom: 8,
    letterSpacing: 1,
  },
});
