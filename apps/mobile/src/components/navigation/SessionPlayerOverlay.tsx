import { useCallback, useEffect } from "react";
import {
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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { IconButton } from "@/components/design-system";
import { SessionSurface, SessionSurfaceEmpty } from "@/components/sessions/SessionSurface";
import { closeSessionPlayer } from "@/lib/sessionPlayer";
import { haptic } from "@/lib/haptics";
import { useMobileUIStore } from "@/stores/ui";
import { alpha, useTheme } from "@/theme";

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

/**
 * The Session Player (§10.8) — the primary session surface in V1. Renders
 * the full `SessionSurface` (header + tab strip + stream) in a bottom-sheet
 * modal that slides over whichever tab the user is on. Opened from session
 * group rows, bottom-accessory cards, deep links, and push-notification taps.
 */
export function SessionPlayerOverlay() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const open = useMobileUIStore((s) => s.sessionPlayerOpen);
  const sessionId = useMobileUIStore((s) => s.overlaySessionId);
  const setOverlaySessionId = useMobileUIStore((s) => s.setOverlaySessionId);

  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (open) {
      dragY.value = 0;
      progress.value = withSpring(1, theme.motion.springs.gentle);
    } else {
      dragY.value = withTiming(0, { duration: theme.motion.durations.base });
      progress.value = withTiming(0, { duration: theme.motion.durations.base });
    }
  }, [
    open,
    progress,
    dragY,
    theme.motion.durations.base,
    theme.motion.springs.gentle,
  ]);

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
        { translateY: interpolate(p, [0, 1], [screenHeight, 0]) + dragY.value },
      ],
    };
  });

  const handleSelectSession = useCallback(
    (nextId: string) => {
      setOverlaySessionId(nextId);
    },
    [setOverlaySessionId],
  );

  if (!open && !sessionId) return null;

  return (
    <View pointerEvents={open ? "auto" : "none"} style={styles.overlay}>
      <Animated.View
        style={[styles.backdrop, { backgroundColor: "#000" }, backdropStyle]}
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
                  { backgroundColor: alpha(theme.colors.foreground, 0.28) },
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
          </View>
        </GestureDetector>

        <View style={styles.surface}>
          {sessionId ? (
            <SessionSurface
              sessionId={sessionId}
              onSelectSession={handleSelectSession}
            />
          ) : (
            <SessionSurfaceEmpty />
          )}
        </View>
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
  surface: {
    flex: 1,
  },
});
