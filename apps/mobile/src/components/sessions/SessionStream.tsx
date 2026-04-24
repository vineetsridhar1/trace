import { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { type FlashListRef } from "@shopify/flash-list";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useEntityField } from "@trace/client-core";
import { useNewActivityTracker } from "@/hooks/useNewActivityTracker";
import { useSessionEvents } from "@/hooks/useSessionEvents";
import { useSessionNodes } from "@/hooks/useSessionNodes";
import {
  calculateTimestampRevealX,
  TIMESTAMP_REVEAL_ACTIVATION,
} from "@/lib/timestampReveal";
import { useTheme } from "@/theme";
import { NewActivityPill } from "./NewActivityPill";
import { SessionStreamList } from "./SessionStreamList";
import {
  SessionStreamEmpty,
  SessionStreamError,
  SessionStreamSkeleton,
} from "./SessionStreamStates";
import {
  buildSessionStreamItems,
  type SessionStreamItemCache,
  type SessionStreamListItem,
} from "./sessionStreamItems";
import type { NodeRenderContext } from "./nodes";

interface SessionStreamProps {
  sessionId: string;
  /**
   * Top padding applied to the FlashList's content so the first message
   * starts below an external overlay (e.g. the Session Player's header)
   * while still allowing content to scroll behind it.
   */
  topInset?: number;
  /**
   * Bottom padding so content can scroll behind the composer / queued-
   * messages overlay at the bottom of the surface.
   */
  bottomInset?: number;
  /**
   * Starts network work for the stream. The Session Player keeps this false
   * while closed so a hidden sheet does no event work.
   */
  loadEvents?: boolean;
  /**
   * Allows fetched/live events to update the entity store. The Session Player
   * starts loading during its open animation, then commits once the sheet lands.
   */
  commitEvents?: boolean;
  /**
   * Controls whether transcript rows mount at all. The Session Player keeps
   * cached rows hidden during its open animation so text layout can't jank it.
   */
  renderEvents?: boolean;
  /** Whether a right-swipe should open the session's web preview. */
  canSwipeToPreview?: boolean;
  /** Called when the user intentionally swipes right to open the preview. */
  onPreviewSwipe?: () => void;
}

const NEAR_BOTTOM_THRESHOLD = 120;
const CONTENT_FADE_MS = 180;
const PREVIEW_SWIPE_DISTANCE = 96;
const PREVIEW_SWIPE_VELOCITY = 700;

export function SessionStream({
  sessionId,
  topInset,
  bottomInset,
  loadEvents = true,
  commitEvents = true,
  renderEvents = true,
  canSwipeToPreview = false,
  onPreviewSwipe,
}: SessionStreamProps) {
  const theme = useTheme();
  const { loading, loadingOlder, hasOlder, error, fetchEvents, fetchOlderEvents } =
    useSessionEvents(sessionId, {
      fetchEnabled: loadEvents,
      commitEnabled: commitEvents,
    });
  const {
    nodes,
    completedAgentTools,
    toolResultByUseId,
    gitCheckpointsByPromptEventId,
    events: scopedEvents,
  } = useSessionNodes(sessionId, { enabled: renderEvents });
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const connection = useEntityField("sessions", sessionId, "connection");

  const listRef = useRef<FlashListRef<SessionStreamListItem>>(null);
  const isNearBottomRef = useRef(true);
  const currentScrollOffsetRef = useRef(0);
  const previousBottomInsetRef = useRef(bottomInset ?? 0);
  const timestampRevealX = useSharedValue(0);
  const contentOpacity = useSharedValue(nodes.length > 0 ? 1 : 0);
  const hasRenderedNodesRef = useRef(nodes.length > 0);
  const { newActivityCount, clearNewActivity } = useNewActivityTracker(
    nodes,
    listRef,
    isNearBottomRef,
  );

  const renderContext = useMemo<NodeRenderContext>(
    () => ({
      sessionId,
      completedAgentTools,
      toolResultByUseId,
      gitCheckpointsByPromptEventId,
    }),
    [sessionId, completedAgentTools, toolResultByUseId, gitCheckpointsByPromptEventId],
  );
  const streamItemCacheRef = useRef<SessionStreamItemCache | undefined>(undefined);
  const streamItems = useMemo(() => {
    const result = buildSessionStreamItems(
      nodes,
      scopedEvents,
      streamItemCacheRef.current,
    );
    streamItemCacheRef.current = result.cache;
    return result.items;
  }, [nodes, scopedEvents]);
  useEffect(() => {
    if (!renderEvents || nodes.length === 0) {
      hasRenderedNodesRef.current = false;
      contentOpacity.value = 0;
      return;
    }
    if (!hasRenderedNodesRef.current) {
      contentOpacity.value = 0;
      contentOpacity.value = withTiming(1, { duration: CONTENT_FADE_MS });
      hasRenderedNodesRef.current = true;
      return;
    }
    contentOpacity.value = 1;
  }, [contentOpacity, nodes.length, renderEvents]);
  const contentFadeStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      currentScrollOffsetRef.current = contentOffset.y;
      const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
      const nearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
      isNearBottomRef.current = nearBottom;
      if (nearBottom) clearNewActivity();
    },
    [clearNewActivity],
  );

  useEffect(() => {
    const nextBottomInset = bottomInset ?? 0;
    const previousBottomInset = previousBottomInsetRef.current;
    const insetDelta = nextBottomInset - previousBottomInset;
    if (insetDelta !== 0 && isNearBottomRef.current) {
      const nextOffset = Math.max(0, currentScrollOffsetRef.current + insetDelta);
      listRef.current?.scrollToOffset({ animated: false, offset: nextOffset });
      currentScrollOffsetRef.current = nextOffset;
    }
    previousBottomInsetRef.current = nextBottomInset;
  }, [bottomInset]);

  const handlePillPress = useCallback(() => {
    clearNewActivity();
    listRef.current?.scrollToEnd({ animated: true });
  }, [clearNewActivity]);

  const timestampRevealGesture = Gesture.Simultaneous(
    Gesture.Pan()
      .activeOffsetX([-TIMESTAMP_REVEAL_ACTIVATION, TIMESTAMP_REVEAL_ACTIVATION])
      .onChange((event) => {
        timestampRevealX.value = calculateTimestampRevealX(event.translationX);
      })
      .onEnd((event) => {
        if (
          canSwipeToPreview &&
          onPreviewSwipe &&
          event.translationX > PREVIEW_SWIPE_DISTANCE &&
          (event.translationX > Math.abs(event.translationY) ||
            event.velocityX > PREVIEW_SWIPE_VELOCITY)
        ) {
          runOnJS(onPreviewSwipe)();
        }
      })
      .onFinalize(() => {
        timestampRevealX.value = withSpring(0, theme.motion.springs.smooth);
      }),
    Gesture.Native(),
  );

  if (!renderEvents || ((loading || !commitEvents) && nodes.length === 0)) {
    return <SessionStreamSkeleton />;
  }
  // A not_started session has no events yet by design — the initial events
  // query commonly 404s for optimistic/pending session ids. Fall through to
  // the friendly empty state instead of surfacing a retry banner.
  if (!loading && nodes.length === 0 && error && agentStatus !== "not_started") {
    return <SessionStreamError error={error} onRetry={() => void fetchEvents()} />;
  }
  if (!loading && nodes.length === 0) return <SessionStreamEmpty agentStatus={agentStatus} />;

  const disconnected = connection?.state === "disconnected";

  return (
    <View style={styles.wrapper}>
      <GestureDetector gesture={timestampRevealGesture}>
        <Animated.View style={[styles.listGestureSurface, contentFadeStyle]}>
          <SessionStreamList
            sessionId={sessionId}
            items={streamItems}
            renderContext={renderContext}
            revealX={timestampRevealX}
            listRef={listRef}
            loadingOlder={loadingOlder}
            hasOlder={hasOlder}
            disconnected={disconnected}
            disconnectReason={connection?.lastError ?? null}
            showTypingIndicator={agentStatus === "active"}
            topInset={topInset}
            bottomInset={bottomInset}
            isNearBottomRef={isNearBottomRef}
            onScroll={handleScroll}
            fetchOlderEvents={fetchOlderEvents}
          />
        </Animated.View>
      </GestureDetector>
      <NewActivityPill
        count={newActivityCount}
        visible={newActivityCount > 0}
        onPress={handlePillPress}
        bottomOffset={bottomInset}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  listGestureSurface: { flex: 1 },
});
