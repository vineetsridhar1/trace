import { useCallback, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useEntityField, type SessionEntity } from "@trace/client-core";
import type { SessionNode } from "@trace/client-core";
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
  const { nodes, completedAgentTools, toolResultByUseId, gitCheckpointsByPromptEventId } =
    useSessionNodes(sessionId);
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as
    | SessionEntity["agentStatus"]
    | undefined;
  const connection = useEntityField("sessions", sessionId, "connection") as
    | SessionEntity["connection"]
    | undefined;

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

  const renderItem = useCallback(
    ({ item, index }: { item: SessionNode; index: number }) => {
      // Fragment keeps the return type a single ReactElement while allowing
      // the child to collapse to null — StreamRow owns padding, so a null
      // dispatcher result reserves zero space.
      return (
        <>
          {renderNode({
            node: item,
            context: renderContext,
            isLast: index === nodes.length - 1,
          })}
        </>
      );
    },
    [nodes.length, renderContext],
  );

  const keyExtractor = useCallback((item: SessionNode) => nodeKey(item), []);

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
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        inverted={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onStartReached={hasOlder && !loadingOlder ? fetchOlderEvents : undefined}
        onStartReachedThreshold={0.2}
        initialScrollIndex={initialScrollIndex}
        maintainVisibleContentPosition={{
          autoscrollToBottomThreshold: 0.2,
          animateAutoScrollToBottom: true,
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

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  olderLoading: { alignItems: "center", paddingVertical: 10 },
  footer: { paddingTop: 8, paddingBottom: 4 },
});
