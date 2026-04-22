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
import { useEntityStore } from "@trace/client-core";
import { haptic } from "@/lib/haptics";
import { selectActiveSessionIds } from "@/lib/activeSessions";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme } from "@/theme";
import { ActiveSessionsAccessoryRow } from "./ActiveSessionsAccessoryRow";

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
  // Tracks the last index we scrolled to so width-only re-runs of the sync
  // effect (tab-bar minimize shrinks the container mid-animation) jump
  // instead of animating through intermediate pages.
  const lastScrolledIndexRef = useRef<number | null>(null);
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
      lastScrolledIndexRef.current = index;
      return;
    }
    if (width === 0 || ids.length === 0) return;
    // Animate only on real index changes. A width change (tab-bar minimize
    // shrinks the accessory) must snap to the same page, not animate through
    // neighbouring sessions.
    const animated = lastScrolledIndexRef.current !== null
      && lastScrolledIndexRef.current !== index;
    lastScrolledIndexRef.current = index;
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
