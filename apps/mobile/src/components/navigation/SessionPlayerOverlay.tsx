import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
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
import { useEntityField } from "@trace/client-core";
import { SessionGroupHeader } from "@/components/sessions/SessionGroupHeader";
import { SessionSurface, SessionSurfaceEmpty } from "@/components/sessions/SessionSurface";
import { SessionTabStrip } from "@/components/sessions/SessionTabStrip";
import { closeSessionPlayer } from "@/lib/sessionPlayer";
import { haptic } from "@/lib/haptics";
import { useMobileUIStore } from "@/stores/ui";
import { alpha, useTheme } from "@/theme";

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
// Conservative header+strip seed so the first message doesn't render under the
// absolute-positioned drag-handle before `onLayout` reports the real height.
// Over-padding by a few points is invisible; under-padding causes a flash.
const ESTIMATED_HEADER_HEIGHT = 56;
const ESTIMATED_TAB_STRIP_HEIGHT = 44;

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
  const activeMenuClose = useMobileUIStore((s) => s.activeMenuClose);
  const headerGroupId = useEntityField("sessions", sessionId ?? "", "sessionGroupId") as
    | string
    | null
    | undefined;
  const [measuredTopInset, setMeasuredTopInset] = useState<number | null>(null);
  const topInsetHeight =
    measuredTopInset
    ?? insets.top + ESTIMATED_HEADER_HEIGHT + ESTIMATED_TAB_STRIP_HEIGHT;

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

  const handleTopInsetLayout = useCallback((e: LayoutChangeEvent) => {
    const height = e.nativeEvent.layout.height;
    setMeasuredTopInset((current) => (current === height ? current : height));
  }, []);

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
        <View style={styles.surface}>
          {sessionId ? (
            <SessionSurface
              sessionId={sessionId}
              onSelectSession={handleSelectSession}
              hideHeader
              topInset={topInsetHeight}
            />
          ) : (
            <SessionSurfaceEmpty />
          )}
        </View>

        {activeMenuClose ? (
          <Pressable
            accessibilityLabel="Dismiss menu"
            onPress={activeMenuClose}
            style={styles.menuScrim}
          />
        ) : null}

        <View
          style={styles.topInset}
          onLayout={handleTopInsetLayout}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={pan}>
            <View
              style={[
                styles.dragHandle,
                { backgroundColor: alpha(theme.colors.background, 0.78) },
              ]}
            >
              <View style={{ height: insets.top }} />
              {sessionId ? (
                <SessionGroupHeader groupId={headerGroupId ?? ""} sessionId={sessionId} />
              ) : null}
              {sessionId ? (
                <SessionTabStrip
                  groupId={headerGroupId ?? ""}
                  activeSessionId={sessionId}
                  onSelect={handleSelectSession}
                />
              ) : null}
            </View>
          </GestureDetector>
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
  topInset: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  menuScrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  dragHandle: {
    overflow: "visible",
  },
  surface: {
    flex: 1,
  },
});
