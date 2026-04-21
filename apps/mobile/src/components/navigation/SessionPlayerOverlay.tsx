import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  FlatList,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
import { useShallow } from "zustand/react/shallow";
import { useEntityStore } from "@trace/client-core";
import { SessionSurface, SessionSurfaceEmpty } from "@/components/sessions/SessionSurface";
import { selectActiveSessionIds } from "@/lib/activeSessions";
import { closeSessionPlayer } from "@/lib/sessionPlayer";
import { haptic } from "@/lib/haptics";
import { useMobileUIStore } from "@/stores/ui";
import { alpha, useTheme } from "@/theme";

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

const keyExtractor = (id: string) => id;

/**
 * The Session Player (§10.8) — the primary session surface in V1. Renders
 * the full `SessionSurface` (header + tab strip + stream) in a bottom-sheet
 * modal that slides over whichever tab the user is on. Opened from session
 * group rows, bottom-accessory cards, deep links, and push-notification taps.
 *
 * Horizontally swiping the sheet pages through the user's active sessions
 * (same list as the bottom accessory), mirroring that pager's UX.
 */
export function SessionPlayerOverlay() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const open = useMobileUIStore((s) => s.sessionPlayerOpen);
  const sessionId = useMobileUIStore((s) => s.overlaySessionId);
  const setOverlaySessionId = useMobileUIStore((s) => s.setOverlaySessionId);
  const setActiveAccessoryIndex = useMobileUIStore((s) => s.setActiveAccessoryIndex);

  const activeIds = useEntityStore(useShallow(selectActiveSessionIds));

  const { data, currentIndex } = useMemo(() => {
    if (!sessionId) return { data: [] as readonly string[], currentIndex: -1 };
    const idx = activeIds.indexOf(sessionId);
    if (idx >= 0) return { data: activeIds, currentIndex: idx };
    // Session isn't in the active list (e.g. merged). Render a single-item
    // list so the surface still shows; swipe-to-cycle is disabled until the
    // user navigates to an active session.
    return { data: [sessionId] as readonly string[], currentIndex: 0 };
  }, [activeIds, sessionId]);

  const listRef = useRef<FlatList<string>>(null);
  // "self" = our own onMomentumScrollEnd drove the sessionId change, so the
  // sync effect should skip the scrollToOffset (the list is already there).
  // "external" = sessionId was set by a tab-strip tap / accessory / deep link.
  const indexSource = useRef<"self" | "external">("external");
  // First sync after layout shouldn't animate — FlatList's initialScrollIndex
  // already put us at the right offset, and animating from 0 would look wrong.
  const hasScrolledRef = useRef(false);

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

  // Keep the FlatList scrolled to the active sessionId when it changes from
  // anywhere other than our own horizontal swipe (tab-strip tap, accessory
  // tap, deep link, or a data shift that moved the session's index).
  useEffect(() => {
    if (indexSource.current === "self") {
      indexSource.current = "external";
      return;
    }
    if (screenWidth === 0 || currentIndex < 0) return;
    const animated = hasScrolledRef.current;
    hasScrolledRef.current = true;
    listRef.current?.scrollToOffset({
      offset: currentIndex * screenWidth,
      animated,
    });
  }, [currentIndex, screenWidth]);

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

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (screenWidth === 0) return;
      const nextIdx = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
      const nextId = data[nextIdx];
      if (!nextId || nextId === sessionId) return;
      indexSource.current = "self";
      setOverlaySessionId(nextId);
      // Only sync the accessory when we swipe within the active-sessions list.
      // If we're on a one-item fallback (merged session), activeAccessoryIndex
      // stays wherever the accessory is.
      if (activeIds[nextIdx] === nextId) setActiveAccessoryIndex(nextIdx);
      void haptic.selection();
    },
    [
      screenWidth,
      data,
      sessionId,
      activeIds,
      setOverlaySessionId,
      setActiveAccessoryIndex,
    ],
  );

  const renderItem: ListRenderItem<string> = useCallback(
    ({ item }) => (
      <View style={{ width: screenWidth }}>
        <SessionSurface
          sessionId={item}
          onSelectSession={handleSelectSession}
          isActive={item === sessionId}
        />
      </View>
    ),
    [screenWidth, sessionId, handleSelectSession],
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<string> | null | undefined, index: number) => ({
      length: screenWidth,
      offset: screenWidth * index,
      index,
    }),
    [screenWidth],
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
        <View style={[styles.topInset, { paddingTop: insets.top }]}>
          <GestureDetector gesture={pan}>
            <View style={styles.dragHandle}>
              <View style={styles.grabberRow}>
                <View
                  style={[
                    styles.grabber,
                    { backgroundColor: alpha(theme.colors.foreground, 0.28) },
                  ]}
                />
              </View>
            </View>
          </GestureDetector>
        </View>

        <View style={styles.surface}>
          {data.length > 0 && screenWidth > 0 ? (
            <FlatList
              ref={listRef}
              data={data as string[]}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              getItemLayout={getItemLayout}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              snapToInterval={screenWidth}
              decelerationRate="fast"
              onMomentumScrollEnd={onMomentumScrollEnd}
              initialScrollIndex={currentIndex >= 0 ? currentIndex : 0}
              windowSize={3}
              maxToRenderPerBatch={3}
              initialNumToRender={3}
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
  topInset: {
    zIndex: 10,
  },
  dragHandle: {
    overflow: "visible",
  },
  grabberRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    paddingBottom: 6,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 999,
  },
  surface: {
    flex: 1,
  },
});
