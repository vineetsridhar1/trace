import { useEffect } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShallow } from "zustand/react/shallow";
import { useEntityStore } from "@trace/client-core";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { IconButton, Text } from "@/components/design-system";
import { selectActiveSessionIds } from "@/lib/activeSessions";
import { closeSessionPlayer } from "@/lib/sessionPlayer";
import { haptic } from "@/lib/haptics";
import { useMobileUIStore } from "@/stores/ui";
import { alpha, useTheme } from "@/theme";
import { SessionPlayerRow } from "./SessionPlayerRow";
import { SessionPlayerSelectedCard } from "./SessionPlayerSelectedCard";

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

export function SessionPlayerOverlay() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const open = useMobileUIStore((s) => s.sessionPlayerOpen);
  const index = useMobileUIStore((s) => s.activeAccessoryIndex);
  const setIndex = useMobileUIStore((s) => s.setActiveAccessoryIndex);
  const ids = useEntityStore(useShallow(selectActiveSessionIds));

  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (open) {
      dragY.value = 0;
      progress.value = withSpring(1, theme.motion.springs.gentle);
    } else {
      dragY.value = withTiming(0, { duration: theme.motion.durations.base });
      progress.value = withTiming(0, {
        duration: theme.motion.durations.base,
      });
    }
  }, [
    open,
    progress,
    dragY,
    theme.motion.durations.base,
    theme.motion.springs.gentle,
  ]);

  useEffect(() => {
    if (ids.length === 0 && open) closeSessionPlayer();
  }, [ids.length, open]);

  useEffect(() => {
    if (ids.length === 0) return;
    const max = ids.length - 1;
    if (index > max) setIndex(max);
  }, [ids.length, index, setIndex]);

  const sessionId = ids[index] ?? ids[0] ?? null;
  const queueIds = ids.filter((_, i) => i !== index);

  const pan = Gesture.Pan()
    .enabled(open)
    .activeOffsetY([-16, 16])
    .failOffsetX([-12, 12])
    .onChange((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (
        event.translationY > DISMISS_DISTANCE ||
        event.velocityY > DISMISS_VELOCITY
      ) {
        runOnJS(closeSessionPlayer)();
      } else {
        dragY.value = withSpring(0, theme.motion.springs.smooth);
      }
    });

  const backdropStyle = useAnimatedStyle(() => {
    const dragFade = Math.max(0, 1 - dragY.value / (screenHeight * 0.7));
    return { opacity: progress.value * 0.88 * dragFade };
  });

  const panelStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      transform: [
        {
          translateY:
            interpolate(p, [0, 1], [screenHeight, 0]) + dragY.value,
        },
      ],
    };
  });

  if (ids.length === 0 && !open) return null;

  return (
    <View
      pointerEvents={open ? "auto" : "none"}
      style={styles.overlay}
    >
      <Animated.View
        style={[
          styles.backdrop,
          { backgroundColor: "#000" },
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
          { backgroundColor: theme.colors.background },
        ]}
      >
        <GestureDetector gesture={pan}>
          <View style={[styles.dragRegion, { paddingTop: insets.top }]}>
            <View style={styles.grabberRow}>
              <View
                style={[
                  styles.grabber,
                  {
                    backgroundColor: alpha(theme.colors.foreground, 0.28),
                  },
                ]}
              />
            </View>
            <View style={styles.closeRow}>
              <IconButton
                symbol="chevron.down"
                size="sm"
                color="mutedForeground"
                accessibilityLabel="Close session player"
                onPress={() => closeSessionPlayer()}
              />
              <View style={styles.closeRowSpacer} />
            </View>
            {sessionId ? (
              <SessionPlayerSelectedCard sessionId={sessionId} />
            ) : null}
          </View>
        </GestureDetector>

        {queueIds.length > 0 ? (
          <View style={styles.queue}>
            <Text
              variant="caption1"
              color="mutedForeground"
              style={styles.queueLabel}
            >
              UP NEXT
            </Text>
            <ScrollView
              contentContainerStyle={{
                paddingBottom: Math.max(insets.bottom, 24),
              }}
              showsVerticalScrollIndicator={false}
            >
              <View
                style={[
                  styles.queueCard,
                  { backgroundColor: alpha(theme.colors.foreground, 0.04) },
                ]}
              >
                {queueIds.map((id, i) => {
                  const rowIndex = ids.indexOf(id);
                  return (
                    <SessionPlayerRow
                      key={id}
                      sessionId={id}
                      showSeparator={i < queueIds.length - 1}
                      onPress={() => {
                        void haptic.selection();
                        setIndex(rowIndex);
                      }}
                    />
                  );
                })}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </Animated.View>
    </View>
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
    overflow: "hidden",
  },
  dragRegion: {},
  grabberRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 999,
  },
  closeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 8,
    marginTop: 4,
  },
  closeRowSpacer: {
    flex: 1,
  },
  queue: {
    flex: 1,
    paddingHorizontal: 16,
  },
  queueLabel: {
    marginLeft: 6,
    marginBottom: 8,
    letterSpacing: 1.2,
    fontWeight: "600",
  },
  queueCard: {
    borderRadius: 16,
    overflow: "hidden",
  },
});
