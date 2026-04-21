import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import type { SessionNode } from "@trace/client-core";
import { Button, Skeleton, Text } from "@/components/design-system";
import { useSessionEvents } from "@/hooks/useSessionEvents";
import { useSessionNodes } from "@/hooks/useSessionNodes";
import { useTheme } from "@/theme";
import { NewActivityPill } from "./NewActivityPill";

interface SessionStreamProps {
  sessionId: string;
  /** Called with the list's scroll offset so parents can drive header solidification. */
  onScrollOffsetChange?: (offsetY: number) => void;
}

const NEAR_BOTTOM_THRESHOLD = 120;

/** In-memory scroll offset per sessionId — preserved across re-mounts within a session. */
const scrollOffsetMemory = new Map<string, number>();

function nodeKey(node: SessionNode): string {
  if (node.kind === "readglob-group") return `rg:${node.items[0]?.id ?? "empty"}`;
  return node.id;
}

export function SessionStream({ sessionId, onScrollOffsetChange }: SessionStreamProps) {
  const theme = useTheme();
  const { loading, loadingOlder, hasOlder, error, fetchEvents, fetchOlderEvents } =
    useSessionEvents(sessionId);
  const { nodes } = useSessionNodes(sessionId);

  const listRef = useRef<FlashListRef<SessionNode>>(null);
  const isNearBottomRef = useRef(true);
  const prevTailKeyRef = useRef<string | null>(null);
  const [newActivityCount, setNewActivityCount] = useState(0);

  // Detect tail advances, not length changes — pagination prepends older events
  // and must not register as new activity.
  useEffect(() => {
    if (nodes.length === 0) {
      prevTailKeyRef.current = null;
      return;
    }
    const tailKey = nodeKey(nodes[nodes.length - 1]);
    const prevTail = prevTailKeyRef.current;
    prevTailKeyRef.current = tailKey;
    if (!prevTail || prevTail === tailKey) return;
    const prevIdx = nodes.findIndex((n) => nodeKey(n) === prevTail);
    const delta = prevIdx === -1 ? 1 : nodes.length - 1 - prevIdx;
    if (delta <= 0) return;
    if (isNearBottomRef.current) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
      return;
    }
    setNewActivityCount((c) => c + delta);
  }, [nodes]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const distanceFromBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height;
      const nearBottom = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
      isNearBottomRef.current = nearBottom;
      if (nearBottom) setNewActivityCount((c) => (c === 0 ? c : 0));
      scrollOffsetMemory.set(sessionId, contentOffset.y);
      onScrollOffsetChange?.(contentOffset.y);
    },
    [onScrollOffsetChange, sessionId],
  );

  const handlePillPress = useCallback(() => {
    setNewActivityCount(0);
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: SessionNode }) => (
      <View style={[styles.row, { paddingHorizontal: theme.spacing.lg }]}>
        <Text variant="body" color="mutedForeground">
          [{item.kind}]
        </Text>
      </View>
    ),
    [theme.spacing.lg],
  );

  const keyExtractor = useCallback((item: SessionNode) => nodeKey(item), []);

  const initialScrollIndex = useMemo(() => {
    if (nodes.length === 0) return undefined;
    const memorized = scrollOffsetMemory.get(sessionId);
    if (memorized != null) return undefined;
    return nodes.length - 1;
  }, [nodes.length, sessionId]);

  if (loading && nodes.length === 0) {
    return (
      <View style={[styles.placeholder, { paddingHorizontal: theme.spacing.lg }]}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={styles.skeletonRow}>
            <Skeleton width="35%" height={12} />
            <Skeleton width="80%" height={12} />
            <Skeleton width="55%" height={12} />
          </View>
        ))}
      </View>
    );
  }

  if (!loading && nodes.length === 0 && error) {
    return (
      <View style={[styles.errorState, { paddingHorizontal: theme.spacing.lg }]}>
        <Text variant="body" color="mutedForeground" align="center">
          Couldn't load session events.
        </Text>
        <Text variant="footnote" color="mutedForeground" align="center">
          {error}
        </Text>
        <Button title="Retry" variant="secondary" size="sm" onPress={() => void fetchEvents()} />
      </View>
    );
  }

  if (!loading && nodes.length === 0) {
    return (
      <View style={[styles.emptyState, { paddingHorizontal: theme.spacing.lg }]}>
        <Text variant="body" color="mutedForeground" align="center">
          Waiting for agent to start…
        </Text>
      </View>
    );
  }

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
  row: { paddingVertical: 6 },
  placeholder: {
    flex: 1,
    paddingTop: 24,
    gap: 18,
  },
  skeletonRow: { gap: 6 },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  olderLoading: {
    alignItems: "center",
    paddingVertical: 10,
  },
});
