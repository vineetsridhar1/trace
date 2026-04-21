import { useCallback, useMemo, type MutableRefObject } from "react";
import {
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import type { SessionNode } from "@trace/client-core";
import type { Event } from "@trace/gql";
import type { SharedValue } from "react-native-reanimated";
import { Text } from "@/components/design-system";
import { nodeKey } from "@/hooks/useNewActivityTracker";
import { useTheme } from "@/theme";
import { ConnectionLostBanner } from "./nodes/ConnectionLostBanner";
import { renderNode, type NodeRenderContext } from "./nodes";
import { TimestampRevealRow } from "./TimestampRevealRow";
import { itemTypeFor, timestampLabelForNode } from "./sessionStreamItems";

interface SessionStreamListProps {
  sessionId: string;
  nodes: SessionNode[];
  renderContext: NodeRenderContext;
  scopedEvents: Record<string, Event>;
  revealX: SharedValue<number>;
  listRef: MutableRefObject<FlashListRef<SessionNode> | null>;
  loadingOlder: boolean;
  hasOlder: boolean;
  disconnected: boolean;
  disconnectReason?: string | null;
  initialScrollIndex?: number;
  /** Extra top padding so content can scroll behind an overlay header. */
  topInset?: number;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  fetchOlderEvents: () => Promise<void>;
}

export function SessionStreamList({
  sessionId,
  nodes,
  renderContext,
  scopedEvents,
  revealX,
  listRef,
  loadingOlder,
  hasOlder,
  disconnected,
  disconnectReason,
  initialScrollIndex,
  topInset = 0,
  onScroll,
  fetchOlderEvents,
}: SessionStreamListProps) {
  const theme = useTheme();
  const horizontalPadding = theme.spacing.lg;
  const extraData = useMemo(
    () => ({ lastIndex: nodes.length - 1, context: renderContext, scopedEvents }),
    [nodes.length, renderContext, scopedEvents],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: SessionNode; index: number }) => (
      <TimestampRevealRow
        paddingHorizontal={horizontalPadding}
        revealX={revealX}
        timestampLabel={timestampLabelForNode(item, scopedEvents)}
      >
        {renderNode({
          node: item,
          context: renderContext,
          isLast: index === nodes.length - 1,
        })}
      </TimestampRevealRow>
    ),
    [horizontalPadding, nodes.length, renderContext, scopedEvents, revealX],
  );

  const keyExtractor = useCallback((item: SessionNode) => nodeKey(item), []);
  const getItemType = useCallback(
    (item: SessionNode) => itemTypeFor(item, scopedEvents),
    [scopedEvents],
  );

  return (
    <FlashList
      ref={listRef}
      data={nodes}
      extraData={extraData}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      maxItemsInRecyclePool={0}
      inverted={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onStartReached={hasOlder && !loadingOlder ? fetchOlderEvents : undefined}
      onStartReachedThreshold={0.2}
      initialScrollIndex={initialScrollIndex}
      maintainVisibleContentPosition={{
        autoscrollToBottomThreshold: 0.2,
        animateAutoScrollToBottom: true,
      }}
      contentContainerStyle={{
        paddingTop: theme.spacing.md + topInset,
        paddingBottom: theme.spacing.md,
      }}
      scrollIndicatorInsets={{ top: topInset }}
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
            <ConnectionLostBanner sessionId={sessionId} reason={disconnectReason ?? null} />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  olderLoading: { alignItems: "center", paddingVertical: 10 },
  footer: { paddingTop: 8, paddingBottom: 4 },
});
