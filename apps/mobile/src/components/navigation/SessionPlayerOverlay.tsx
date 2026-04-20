import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useShallow } from "zustand/react/shallow";
import { useEntityField, useEntityStore } from "@trace/client-core";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
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

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function SessionPlayerOverlay() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const open = useMobileUIStore((s) => s.sessionPlayerOpen);
  const index = useMobileUIStore((s) => s.activeAccessoryIndex);
  const setIndex = useMobileUIStore((s) => s.setActiveAccessoryIndex);
  const anchor = useMobileUIStore((s) => s.sessionPlayerAnchor);
  const ids = useEntityStore(useShallow(selectActiveSessionIds));

  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  const heroRef = useRef<View>(null);
  const [heroFrame, setHeroFrame] = useState<Frame | null>(null);

  useEffect(() => {
    if (open) {
      dragY.value = 0;
      progress.value = withSpring(1, theme.motion.springs.gentle);
      setHeroFrame(null);
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
    return { opacity: progress.value * 0.86 * dragFade };
  });

  const panelStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (!anchor) {
      return {
        transform: [
          {
            translateY:
              interpolate(p, [0, 1], [screenHeight, 0]) + dragY.value,
          },
        ],
        borderRadius: 0,
      };
    }
    const anchorCenterX = anchor.x + anchor.width / 2;
    const anchorCenterY = anchor.y + anchor.height / 2;
    const screenCenterX = screenWidth / 2;
    const screenCenterY = screenHeight / 2;
    return {
      transform: [
        {
          translateX: interpolate(p, [0, 1], [anchorCenterX - screenCenterX, 0]),
        },
        {
          translateY:
            interpolate(p, [0, 1], [anchorCenterY - screenCenterY, 0]) +
            dragY.value,
        },
        { scaleX: interpolate(p, [0, 1], [anchor.width / screenWidth, 1]) },
        { scaleY: interpolate(p, [0, 1], [anchor.height / screenHeight, 1]) },
      ],
      borderRadius: interpolate(p, [0, 1], [14, 0]),
    };
  });

  const contentStyle = useAnimatedStyle(() => {
    if (!anchor) return { opacity: 1 };
    return {
      opacity: interpolate(progress.value, [0.35, 0.95], [0, 1], "clamp"),
    };
  });

  // Real title fades in at the tail of the morph, once the flying title has
  // landed on the hero frame. If there's no anchor to fly from, the title
  // stays visible from the start.
  const hasAnchor = !!anchor;
  const hasHero = !!heroFrame;
  const realTitleOpacity = useDerivedValue(() => {
    if (!hasAnchor) return 1;
    if (!hasHero) return 0;
    return interpolate(progress.value, [0.9, 1], [0, 1], "clamp");
  });

  const flyingTitleStyle = useAnimatedStyle(() => {
    if (!anchor || !heroFrame) return { opacity: 0 };
    const p = progress.value;
    return {
      opacity: interpolate(p, [0, 0.9, 1], [1, 1, 0], "clamp"),
      left: interpolate(p, [0, 1], [anchor.x, heroFrame.x]),
      top: interpolate(p, [0, 1], [anchor.y, heroFrame.y]),
      width: interpolate(p, [0, 1], [anchor.width, heroFrame.width]),
      transform: [
        {
          scale: interpolate(p, [0, 1], [anchor.height / heroFrame.height, 1]),
        },
      ],
    };
  });

  const measureHero = useCallback(() => {
    heroRef.current?.measureInWindow((x, y, width, height) => {
      setHeroFrame({ x, y, width, height });
    });
  }, []);

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
        <Animated.View style={[styles.panelContent, contentStyle]}>
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
                <SessionPlayerSelectedCard
                  ref={heroRef}
                  sessionId={sessionId}
                  titleOpacity={realTitleOpacity}
                />
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
      </Animated.View>

      {sessionId && anchor ? (
        <FlyingTitle
          sessionId={sessionId}
          style={flyingTitleStyle}
          onLayoutReady={measureHero}
        />
      ) : null}
    </View>
  );
}

function FlyingTitle({
  sessionId,
  style,
  onLayoutReady,
}: {
  sessionId: string;
  style: ReturnType<typeof useAnimatedStyle>;
  onLayoutReady: () => void;
}) {
  const name = useEntityField("sessions", sessionId, "name");

  useEffect(() => {
    // Wait one frame for the hero title to layout before measuring.
    const raf = requestAnimationFrame(() => onLayoutReady());
    return () => cancelAnimationFrame(raf);
  }, [onLayoutReady, name]);

  return (
    <Animated.View style={[styles.flyingTitle, style]} pointerEvents="none">
      <Text variant="title2" numberOfLines={2} align="center">
        {name ?? "Session"}
      </Text>
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
    overflow: "hidden",
  },
  panelContent: {
    flex: 1,
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
  flyingTitle: {
    position: "absolute",
    alignItems: "center",
  },
});
