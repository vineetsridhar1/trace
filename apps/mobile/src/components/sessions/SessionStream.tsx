import { useCallback, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
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

interface SessionStreamProps {
  sessionId: string;
  /** Called with the list's scroll offset so parents can drive header solidification. */
  onScrollOffsetChange?: (offsetY: number) => void;
}

const NEAR_BOTTOM_THRESHOLD = 120;

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

  const extraData = useMemo(
    () => ({ lastIndex: nodes.length - 1, context: renderContext }),
    [nodes.length, renderContext],
  );

  const horizontalPadding = theme.spacing.lg;
  const renderItem = useCallback(
    ({
      item,
      index,
      extraData: ed,
    }: {
      item: SessionNode;
      index: number;
      extraData?: { lastIndex: number; context: NodeRenderContext };
    }) => {
      if (!ed) return null;
      // Stable View root — FlashList v2 recycles by cell shape, so every row
      // must resolve to the same element tree. `useSessionNodes` already
      // filters out event nodes the dispatcher can't render.
      return (
        <View style={[styles.row, { paddingHorizontal: horizontalPadding }]}>
          {renderNode({
            node: item,
            context: ed.context,
            isLast: index === ed.lastIndex,
          })}
        </View>
      );
    },
    [horizontalPadding],
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
      <FlashList
        ref={listRef}
        data={nodes}
        extraData={extraData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
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
      <NewActivityPill
        count={newActivityCount}
        visible={newActivityCount > 0}
        onPress={handlePillPress}
      />
    </View>
  );
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
  row: { paddingVertical: 6 },
  olderLoading: { alignItems: "center", paddingVertical: 10 },
  footer: { paddingTop: 8, paddingBottom: 4 },
});
