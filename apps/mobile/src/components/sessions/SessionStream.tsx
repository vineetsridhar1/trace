import { useCallback, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { type FlashListRef } from "@shopify/flash-list";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSharedValue, withSpring } from "react-native-reanimated";
import { useEntityField } from "@trace/client-core";
import type { SessionNode } from "@trace/client-core";
import { useNewActivityTracker } from "@/hooks/useNewActivityTracker";
import { useSessionEvents } from "@/hooks/useSessionEvents";
import { useSessionNodes } from "@/hooks/useSessionNodes";
import { useTheme } from "@/theme";
import { NewActivityPill } from "./NewActivityPill";
import { SessionStreamList } from "./SessionStreamList";
import {
  SessionStreamEmpty,
  SessionStreamError,
  SessionStreamSkeleton,
} from "./SessionStreamStates";
import { TIMESTAMP_REVEAL_DISTANCE } from "./TimestampRevealRow";
import type { NodeRenderContext } from "./nodes";

interface SessionStreamProps {
  sessionId: string;
  /** Called with the list's scroll offset so parents can drive header solidification. */
  onScrollOffsetChange?: (offsetY: number) => void;
}

const NEAR_BOTTOM_THRESHOLD = 120;
const TIMESTAMP_REVEAL_ACTIVATION = 24;
const TIMESTAMP_REVEAL_FAIL_Y = 20;
const TIMESTAMP_REVEAL_RESISTANCE = 0.5;

/** In-memory scroll offset per sessionId — preserved across re-mounts within a session. */
const scrollOffsetMemory = new Map<string, number>();

export function SessionStream({ sessionId, onScrollOffsetChange }: SessionStreamProps) {
  const theme = useTheme();
  const { loading, loadingOlder, hasOlder, error, fetchEvents, fetchOlderEvents } =
    useSessionEvents(sessionId);
  const {
    nodes,
    completedAgentTools,
    toolResultByUseId,
    gitCheckpointsByPromptEventId,
    events: scopedEvents,
  } = useSessionNodes(sessionId);
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus");
  const connection = useEntityField("sessions", sessionId, "connection");

  const listRef = useRef<FlashListRef<SessionNode>>(null);
  const isNearBottomRef = useRef(true);
  const timestampRevealX = useSharedValue(0);
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
      sessionActive: agentStatus === "active",
    }),
    [
      sessionId,
      completedAgentTools,
      toolResultByUseId,
      gitCheckpointsByPromptEventId,
      agentStatus,
    ],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const distanceFromBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height;
      const nearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
      isNearBottomRef.current = nearBottom;
      if (nearBottom) clearNewActivity();
      scrollOffsetMemory.set(sessionId, contentOffset.y);
      onScrollOffsetChange?.(contentOffset.y);
    },
    [clearNewActivity, onScrollOffsetChange, sessionId],
  );

  const handlePillPress = useCallback(() => {
    clearNewActivity();
    listRef.current?.scrollToEnd({ animated: true });
  }, [clearNewActivity]);

  const timestampRevealGesture = Gesture.Pan()
    .activeOffsetX([-TIMESTAMP_REVEAL_ACTIVATION, TIMESTAMP_REVEAL_ACTIVATION])
    .failOffsetY([-TIMESTAMP_REVEAL_FAIL_Y, TIMESTAMP_REVEAL_FAIL_Y])
    .onChange((event) => {
      const rawX = Math.max(0, -event.translationX - TIMESTAMP_REVEAL_ACTIVATION);
      timestampRevealX.value = Math.min(
        TIMESTAMP_REVEAL_DISTANCE,
        rawX * TIMESTAMP_REVEAL_RESISTANCE,
      );
    })
    .onFinalize(() => {
      timestampRevealX.value = withSpring(0, theme.motion.springs.smooth);
    });

  const initialScrollIndex = useMemo(() => {
    if (nodes.length === 0) return undefined;
    if (scrollOffsetMemory.has(sessionId)) return undefined;
    return nodes.length - 1;
  }, [nodes.length, sessionId]);

  if (loading && nodes.length === 0) return <SessionStreamSkeleton />;
  if (!loading && nodes.length === 0 && error) {
    return <SessionStreamError error={error} onRetry={() => void fetchEvents()} />;
  }
  if (!loading && nodes.length === 0) return <SessionStreamEmpty />;

  const disconnected = connection?.state === "disconnected";

  return (
    <View style={styles.wrapper}>
      <GestureDetector gesture={timestampRevealGesture}>
        <View style={styles.listGestureSurface}>
          <SessionStreamList
            sessionId={sessionId}
            nodes={nodes}
            renderContext={renderContext}
            scopedEvents={scopedEvents}
            revealX={timestampRevealX}
            listRef={listRef}
            loadingOlder={loadingOlder}
            hasOlder={hasOlder}
            disconnected={disconnected}
            disconnectReason={connection?.lastError ?? null}
            initialScrollIndex={initialScrollIndex}
            onScroll={handleScroll}
            fetchOlderEvents={fetchOlderEvents}
          />
        </View>
      </GestureDetector>
      <NewActivityPill
        count={newActivityCount}
        visible={newActivityCount > 0}
        onPress={handlePillPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  listGestureSurface: { flex: 1 },
});
