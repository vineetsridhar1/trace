import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  type LayoutChangeEvent,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { useShallow } from "zustand/react/shallow";
import { useEntityStore, type EntityState, type SessionEntity } from "@trace/client-core";
import { Text } from "@/components/design-system/Text";
import { haptic } from "@/lib/haptics";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme, type Theme } from "@/theme";

/**
 * Active = agent is working (`active`) or the session is waiting on the user
 * (`needs_input`). These are the states where a live view is meaningful.
 */
export function selectActiveSessions(state: EntityState): SessionEntity[] {
  const out: SessionEntity[] = [];
  for (const id in state.sessions) {
    const s = state.sessions[id];
    if (s.agentStatus === "active" || s.sessionStatus === "needs_input") {
      out.push(s);
    }
  }
  out.sort((a, b) => {
    const at = a._sortTimestamp ?? "";
    const bt = b._sortTimestamp ?? "";
    if (at === bt) return 0;
    return at < bt ? 1 : -1;
  });
  return out;
}

function keyExtractor(s: SessionEntity) {
  return s.id;
}

export function ActiveSessionsAccessory() {
  const sessions = useEntityStore(useShallow(selectActiveSessions));
  const index = useMobileUIStore((s) => s.activeAccessoryIndex);
  const setIndex = useMobileUIStore((s) => s.setActiveAccessoryIndex);
  const theme = useTheme();
  const listRef = useRef<FlatList<SessionEntity>>(null);
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth((prev) => (prev === w ? prev : w));
  }, []);

  // Clamp the shared index whenever the active-sessions list shrinks beneath it
  // (e.g. a session finishes and drops out of the pager).
  useEffect(() => {
    if (sessions.length === 0) {
      if (index !== 0) setIndex(0);
      return;
    }
    const max = sessions.length - 1;
    if (index > max) setIndex(max);
  }, [sessions.length, index, setIndex]);

  // Keep the scroll position in sync when the index is driven from elsewhere
  // (e.g. horizontal swipe inside the expanded Session Player in 15b).
  useEffect(() => {
    if (width === 0 || sessions.length === 0) return;
    listRef.current?.scrollToOffset({ offset: index * width, animated: true });
  }, [index, width, sessions.length]);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width === 0) return;
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      if (next !== index) {
        setIndex(next);
        haptic.selection();
      }
    },
    [width, index, setIndex],
  );

  const renderItem: ListRenderItem<SessionEntity> = useCallback(
    ({ item }) => <SessionRow session={item} width={width} theme={theme} />,
    [width, theme],
  );

  if (sessions.length === 0) return null;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {width > 0 ? (
        <FlatList
          ref={listRef}
          data={sessions}
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

// TODO(15b): open the Session Player sheet with this session focused.
function openSessionPlayer(_sessionId: string) {}

function SessionRow({
  session,
  width,
  theme,
}: {
  session: SessionEntity;
  width: number;
  theme: Theme;
}) {
  const tool = session.tool === "claude_code" ? "Claude" : session.tool === "codex" ? "Codex" : "Agent";
  const status = session.sessionStatus === "needs_input" ? "needs input" : session.agentStatus;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open session player — ${session.name}`}
      style={[styles.page, { width }]}
      onPress={() => {
        haptic.light();
        openSessionPlayer(session.id);
      }}
    >
      <View style={[styles.symbolWrap, { backgroundColor: theme.colors.accentMuted }]}>
        <SymbolView
          name="bolt.horizontal.fill"
          size={16}
          tintColor={theme.colors.accent}
          weight="semibold"
        />
      </View>
      <View style={styles.text}>
        <Text variant="body" numberOfLines={1} style={styles.title}>
          {session.name}
        </Text>
        <Text variant="caption1" color="mutedForeground" numberOfLines={1}>
          {`${tool} · ${status}`}
        </Text>
      </View>
      <SymbolView
        name="chevron.up"
        size={14}
        tintColor={theme.colors.mutedForeground}
        weight="medium"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  page: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  symbolWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
  },
  title: {
    fontWeight: "600",
  },
});
