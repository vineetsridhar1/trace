import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Platform, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import Animated, { Keyframe, type SharedValue } from "react-native-reanimated";
import { Text } from "@/components/design-system";
import { useTheme } from "@/theme";
import { ConnectionLostBanner } from "./nodes/ConnectionLostBanner";
import { renderNode, type NodeRenderContext } from "./nodes";
import { TimestampRevealRow } from "./TimestampRevealRow";
import type { SessionStreamListItem } from "./sessionStreamItems";

// Subtle rise-into-place for a freshly-arrived last bubble. Default `FadeInDown`
// translates from ~300px below which reads as a flash — this is a small,
// deliberate slide so the message visibly rises out of the composer area.
const messageEnter = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 18 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
}).duration(260);

interface SessionStreamListProps {
  sessionId: string;
  items: SessionStreamListItem[];
  renderContext: NodeRenderContext;
  revealX: SharedValue<number>;
  listRef: MutableRefObject<FlashListRef<SessionStreamListItem> | null>;
  loadingOlder: boolean;
  hasOlder: boolean;
  disconnected: boolean;
  disconnectReason?: string | null;
  /** Extra top padding so content can scroll behind an overlay header. */
  topInset?: number;
  /** Extra bottom padding so content can scroll behind the composer overlay. */
  bottomInset?: number;
  /**
   * Mutable ref tracking whether the user is currently near the bottom of
   * the stream. When true, brand-new last-row mounts get a brief entrance
   * animation; when false (user has scrolled up), the row appears without
   * fanfare so it can't yank attention.
   */
  isNearBottomRef: MutableRefObject<boolean>;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  fetchOlderEvents: () => Promise<void>;
}

export function SessionStreamList({
  sessionId,
  items,
  renderContext,
  revealX,
  listRef,
  loadingOlder,
  hasOlder,
  disconnected,
  disconnectReason,
  topInset = 0,
  bottomInset = 0,
  isNearBottomRef,
  onScroll,
  fetchOlderEvents,
}: SessionStreamListProps) {
  const theme = useTheme();
  const horizontalPadding = theme.spacing.lg;
  const extraData = useMemo(() => ({ context: renderContext }), [renderContext]);
  // Suppress entrance on the initial render so the first batch doesn't
  // cascade-fade. After one frame, brand-new last-row mounts animate in.
  const [acceptEntering, setAcceptEntering] = useState(false);
  useEffect(() => {
    const handle = requestAnimationFrame(() => setAcceptEntering(true));
    return () => cancelAnimationFrame(handle);
  }, []);
  // Track the most-recently-seen last-row key so we only animate when the
  // last row is *actually new*, not just re-rendered (e.g., when its event
  // payload changed but its identity didn't).
  const lastSeenKeyRef = useRef<string | null>(null);

  const renderItem = useCallback(
    ({ item }: { item: SessionStreamListItem }) => {
      const isFreshLast =
        item.isLast &&
        acceptEntering &&
        isNearBottomRef.current &&
        lastSeenKeyRef.current !== item.key;
      if (item.isLast) lastSeenKeyRef.current = item.key;
      const body = (
        <TimestampRevealRow
          paddingHorizontal={horizontalPadding}
          revealX={revealX}
          timestampLabel={item.timestampLabel}
        >
          {renderNode({
            node: item.node,
            context: renderContext,
            isLast: item.isLast,
          })}
        </TimestampRevealRow>
      );
      if (!isFreshLast) return body;
      return <Animated.View entering={messageEnter}>{body}</Animated.View>;
    },
    [
      acceptEntering,
      horizontalPadding,
      isNearBottomRef,
      renderContext,
      revealX,
    ],
  );

  const keyExtractor = useCallback((item: SessionStreamListItem) => item.key, []);
  const getItemType = useCallback((item: SessionStreamListItem) => item.itemType, []);

  return (
    <FlashList
      ref={listRef}
      data={items}
      extraData={extraData}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      maxItemsInRecyclePool={24}
      inverted={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      keyboardShouldPersistTaps="handled"
      onStartReached={hasOlder && !loadingOlder ? fetchOlderEvents : undefined}
      onStartReachedThreshold={0.2}
      maintainVisibleContentPosition={{
        autoscrollToBottomThreshold: 0.2,
        animateAutoScrollToBottom: true,
        startRenderingFromBottom: true,
      }}
      contentContainerStyle={{
        paddingTop: theme.spacing.md + topInset,
        paddingBottom: theme.spacing.md + bottomInset,
      }}
      scrollIndicatorInsets={{ top: topInset, bottom: bottomInset }}
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
