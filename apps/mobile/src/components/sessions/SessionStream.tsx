import { useCallback, useMemo, useRef, type ReactNode } from "react";
import {
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { useEntityField } from "@trace/client-core";
import type { SessionNode } from "@trace/client-core";
import type { Event } from "@trace/gql";
import { asJsonObject } from "@trace/shared";
import { Text } from "@/components/design-system";
import { useNewActivityTracker, nodeKey } from "@/hooks/useNewActivityTracker";
import { useSessionEvents } from "@/hooks/useSessionEvents";
import { useSessionNodes } from "@/hooks/useSessionNodes";
import { useTheme } from "@/theme";
import { NewActivityPill } from "./NewActivityPill";
import { ConnectionLostBanner } from "./nodes/ConnectionLostBanner";
import { renderNode, type NodeRenderContext } from "./nodes";
import {
  SessionStreamEmpty,
  SessionStreamError,
  SessionStreamSkeleton,
} from "./SessionStreamStates";
import { formatTime } from "./nodes/utils";

interface SessionStreamProps {
  sessionId: string;
  /** Called with the list's scroll offset so parents can drive header solidification. */
  onScrollOffsetChange?: (offsetY: number) => void;
}

const NEAR_BOTTOM_THRESHOLD = 120;
const TIMESTAMP_REVEAL_DISTANCE = 72;
const TIMESTAMP_REVEAL_ACTIVATION = 10;

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
    .failOffsetY([-10, 10])
    .onChange((event) => {
      timestampRevealX.value = Math.min(
        TIMESTAMP_REVEAL_DISTANCE,
        Math.max(0, -event.translationX),
      );
    })
    .onFinalize(() => {
      timestampRevealX.value = withSpring(0, theme.motion.springs.smooth);
    });

  const extraData = useMemo(
    () => ({ lastIndex: nodes.length - 1, context: renderContext, scopedEvents }),
    [nodes.length, renderContext, scopedEvents],
  );

  const horizontalPadding = theme.spacing.lg;
  const renderItem = useCallback(
    ({
      item,
      index,
    }: {
      item: SessionNode;
      index: number;
    }) => {
      // Stable View root — FlashList v2 recycles by cell shape, so every row
      // must resolve to the same element tree. `useSessionNodes` already
      // filters out event nodes the dispatcher can't render.
      return (
        <TimestampRevealRow
          paddingHorizontal={horizontalPadding}
          revealX={timestampRevealX}
          timestampLabel={timestampLabelForNode(item, scopedEvents)}
        >
          {renderNode({
            node: item,
            context: renderContext,
            isLast: index === nodes.length - 1,
          })}
        </TimestampRevealRow>
      );
    },
    [horizontalPadding, nodes.length, renderContext, scopedEvents, timestampRevealX],
  );

  const keyExtractor = useCallback((item: SessionNode) => nodeKey(item), []);

  // Segment FlashList's recycling pools as finely as possible. Cells in a
  // pool are recycled into one another, and Fabric crashes ("Attempt to
  // recycle a mounted view") when the new tree shape doesn't line up with
  // the cell's mounted native views. SessionNode.kind alone isn't enough —
  // the `event` kind dispatches to wildly different sub-renderers based on
  // eventType / payload.type. For assistant + user session_outputs (which
  // mix AssistantMessage / ToolCallRow / SubagentRow per event), give each
  // event its own pool so no cross-recycling happens.
  const getItemType = useCallback(
    (item: SessionNode) => itemTypeFor(item, scopedEvents),
    [scopedEvents],
  );

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
          <FlashList
            ref={listRef}
            data={nodes}
            extraData={extraData}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            // Keep virtualization, but do not let FlashList reuse native-backed
            // session rows across Fabric mounts. The stream mixes ContextMenu,
            // SymbolView, Markdown, and rapidly changing agent output.
            maxItemsInRecyclePool={0}
            inverted={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onStartReached={hasOlder && !loadingOlder ? fetchOlderEvents : undefined}
            onStartReachedThreshold={0.2}
            initialScrollIndex={initialScrollIndex}
            maintainVisibleContentPosition={{
              autoscrollToBottomThreshold: 0.2,
              // Animating auto-scroll during rapid streaming interacts badly
              // with Fabric recycling — let the list jump instantly instead.
              animateAutoScrollToBottom: false,
            }}
            contentContainerStyle={{ paddingVertical: theme.spacing.md }}
            ListHeaderComponent={
              loadingOlder ? (
                <View style={styles.olderLoading}>
                  <Text variant="footnote" color="mutedForeground">
                    Loading older messages…
                  </Text>
                </View>
              ) : !hasOlder ? (
                <View style={styles.olderLoading}>
                  <Text variant="caption1" color="mutedForeground">
                    Beginning of session
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              disconnected ? (
                <View style={[styles.footer, { paddingHorizontal: theme.spacing.lg }]}>
                  <ConnectionLostBanner
                    sessionId={sessionId}
                    reason={connection?.lastError ?? null}
                  />
                </View>
              ) : null
            }
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

interface TimestampRevealRowProps {
  children: ReactNode;
  paddingHorizontal: number;
  revealX: SharedValue<number>;
  timestampLabel?: string | null;
}

function TimestampRevealRow({
  children,
  paddingHorizontal,
  revealX,
  timestampLabel,
}: TimestampRevealRowProps) {
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -revealX.value }],
  }));
  const timestampStyle = useAnimatedStyle(() => ({
    opacity: timestampLabel
      ? interpolate(
          revealX.value,
          [0, TIMESTAMP_REVEAL_DISTANCE * 0.45],
          [0, 1],
          Extrapolation.CLAMP,
        )
      : 0,
    transform: [
      {
        translateX: interpolate(
          revealX.value,
          [0, TIMESTAMP_REVEAL_DISTANCE],
          [12, 0],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <View style={[styles.row, { paddingHorizontal }]}>
      {timestampLabel ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.timestampReveal,
            { right: paddingHorizontal },
            timestampStyle,
          ]}
        >
          <Text variant="caption2" color="dimForeground">
            {timestampLabel}
          </Text>
        </Animated.View>
      ) : null}
      <Animated.View style={contentStyle}>{children}</Animated.View>
    </View>
  );
}

function timestampLabelForNode(
  item: SessionNode,
  events: Record<string, Event>,
): string | null {
  switch (item.kind) {
    case "event": {
      const timestamp = events[item.id]?.timestamp;
      return timestamp ? formatTime(timestamp) : null;
    }
    case "command-execution":
    case "plan-review":
    case "ask-user-question":
      return formatTime(item.timestamp);
    case "readglob-group": {
      const last = item.items[item.items.length - 1];
      return last ? formatTime(last.timestamp) : null;
    }
  }
}

function itemTypeFor(item: SessionNode, events: Record<string, Event>): string {
  if (item.kind !== "event") return item.kind;
  const event = events[item.id];
  if (!event) return "event:unknown";
  if (event.eventType === "session_output") {
    const payload = asJsonObject(event.payload);
    const payloadType = typeof payload?.type === "string" ? payload.type : "unknown";
    // Assistant/user session_outputs render a per-event mix of text +
    // tool_use + subagent rows. The shape is too variable to recycle
    // safely, so pin each event to its own pool.
    if (payloadType === "assistant" || payloadType === "user") {
      return `event:so:${payloadType}:${item.id}`;
    }
    return `event:so:${payloadType}`;
  }
  return `event:${event.eventType}`;
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  listGestureSurface: { flex: 1 },
  row: { paddingVertical: 6 },
  timestampReveal: {
    position: "absolute",
    top: 6,
    bottom: 6,
    width: TIMESTAMP_REVEAL_DISTANCE,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  olderLoading: { alignItems: "center", paddingVertical: 10 },
  footer: { paddingTop: 8, paddingBottom: 4 },
});
