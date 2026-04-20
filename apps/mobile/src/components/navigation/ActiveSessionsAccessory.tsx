import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  type LayoutChangeEvent,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  View,
} from "react-native";
import { useShallow } from "zustand/react/shallow";
import { useEntityStore, type EntityState } from "@trace/client-core";
import { haptic } from "@/lib/haptics";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme } from "@/theme";
import { ActiveSessionsAccessoryRow } from "./ActiveSessionsAccessoryRow";

const EMPTY_IDS: readonly string[] = Object.freeze([]);

/**
 * IDs of every session the user is still interacting with — everything except
 * `merged` (shipped), `failed` (errored), and sessions whose group is archived.
 * Sorted by `_sortTimestamp` desc. Wrap callers in `useShallow`. Returns IDs
 * (not entities) so rows re-render only when their own fields change.
 */
export function selectActiveSessionIds(state: EntityState): readonly string[] {
  let out: Array<{ id: string; ts: string }> | null = null;
  for (const id in state.sessions) {
    const s = state.sessions[id];
    if (s.sessionStatus === "merged") continue;
    if (s.agentStatus === "failed") continue;
    if (s.sessionGroupId) {
      const g = state.sessionGroups[s.sessionGroupId];
      if (g && (g.archivedAt || g.status === "archived")) continue;
    }
    (out ??= []).push({ id, ts: s._sortTimestamp ?? "" });
  }
  if (!out) return EMPTY_IDS;
  out.sort((a, b) => (a.ts === b.ts ? 0 : a.ts < b.ts ? 1 : -1));
  return out.map((e) => e.id);
}

const keyExtractor = (id: string) => id;

export function ActiveSessionsAccessory() {
  const ids = useEntityStore(useShallow(selectActiveSessionIds));
  const index = useMobileUIStore((s) => s.activeAccessoryIndex);
  const setIndex = useMobileUIStore((s) => s.setActiveAccessoryIndex);
  const theme = useTheme();
  const listRef = useRef<FlatList<string>>(null);
  // "self" = our own onMomentumScrollEnd pushed the index, so the sync effect
  // should skip scrolling (the list is already there). "external" = 15b swipe.
  const indexSource = useRef<"self" | "external">("external");
  // First sync-scroll after layout shouldn't animate — nothing to animate from.
  const hasScrolledRef = useRef(false);
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth((prev) => (prev === w ? prev : w));
  }, []);

  // Clamp the shared index whenever the list shrinks beneath it.
  useEffect(() => {
    if (ids.length === 0) {
      if (index !== 0) setIndex(0);
      return;
    }
    const max = ids.length - 1;
    if (index > max) setIndex(max);
  }, [ids.length, index, setIndex]);

  // Keep scroll position in sync when the index is driven from elsewhere
  // (e.g. horizontal swipe inside the expanded Session Player in 15b).
  useEffect(() => {
    if (indexSource.current === "self") {
      indexSource.current = "external";
      return;
    }
    if (width === 0 || ids.length === 0) return;
    const animated = hasScrolledRef.current;
    hasScrolledRef.current = true;
    listRef.current?.scrollToOffset({ offset: index * width, animated });
  }, [index, width, ids.length]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width === 0) return;
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      if (next !== index) {
        indexSource.current = "self";
        setIndex(next);
        haptic.selection();
      }
    },
    [width, index, setIndex],
  );

  const renderItem: ListRenderItem<string> = useCallback(
    ({ item }) => <ActiveSessionsAccessoryRow sessionId={item} width={width} theme={theme} />,
    [width, theme],
  );

  if (ids.length === 0) return null;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {width > 0 ? (
        <FlatList
          ref={listRef}
          data={ids}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={width}
          decelerationRate="fast"
          onMomentumScrollEnd={onMomentumScrollEnd}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
