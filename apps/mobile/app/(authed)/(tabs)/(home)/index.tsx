import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import { EmptyState } from "@/components/design-system";
import { useTheme } from "@/theme";
import { HomeSectionHeader } from "@/components/home/HomeSectionHeader";
import { HomeSessionRow } from "@/components/home/HomeSessionRow";
import { useHomeSections, type HomeSectionKind } from "@/hooks/useHomeSections";
import { refreshOrgData } from "@/hooks/useHydrate";
import { haptic } from "@/lib/haptics";

type HomeListItem =
  | { kind: "header"; section: HomeSectionKind; count: number }
  | { kind: "row"; sessionId: string }
  | { kind: "filler"; index: number };

export default function AuthedHome() {
  const theme = useTheme();
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const userId = useAuthStore((s: AuthState) => s.user?.id ?? null);
  const logout = useAuthStore((s: AuthState) => s.logout);
  const sections = useHomeSections(userId);
  const [refreshing, setRefreshing] = useState(false);

  const items = useMemo<HomeListItem[]>(() => {
    const out: HomeListItem[] = [];
    for (const section of sections) {
      out.push({ kind: "header", section: section.kind, count: section.ids.length });
      for (const id of section.ids) {
        out.push({ kind: "row", sessionId: id });
      }
    }
    // DEBUG: temporary filler rows to test tab bar minimize-on-scroll.
    for (let i = 0; i < 50; i++) {
      out.push({ kind: "filler", index: i });
    }
    return out;
  }, [sections]);

  const handleRefresh = useCallback(async () => {
    if (!activeOrgId) return;
    void haptic.medium();
    setRefreshing(true);
    try {
      const ok = await refreshOrgData(activeOrgId);
      if (!ok) {
        useEntityStore.getState().reset();
        await logout();
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeOrgId, logout]);

  return (
    <FlashList
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      contentInsetAdjustmentBehavior="automatic"
      onRefresh={handleRefresh}
      refreshing={refreshing}
      ListEmptyComponent={<HomeEmpty />}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    />
  );
}

function renderItem({ item }: { item: HomeListItem }) {
  if (item.kind === "header") {
    return <HomeSectionHeader kind={item.section} count={item.count} />;
  }
  if (item.kind === "filler") {
    return <FillerRow index={item.index} />;
  }
  return <HomeSessionRow sessionId={item.sessionId} />;
}

function FillerRow({ index }: { index: number }) {
  return (
    <View style={styles.filler}>
      <RNText style={styles.fillerText}>Filler row {index + 1}</RNText>
    </View>
  );
}

function keyExtractor(item: HomeListItem): string {
  if (item.kind === "header") return `h:${item.section}`;
  if (item.kind === "filler") return `f:${item.index}`;
  return `r:${item.sessionId}`;
}

function getItemType(item: HomeListItem): string {
  return item.kind;
}

function HomeEmpty() {
  return (
    <View style={styles.empty}>
      <EmptyState
        icon="checkmark.seal"
        title="All clear"
        subtitle="Sessions that need you will show up here."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingTop: 80,
  },
  filler: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#222",
  },
  fillerText: {
    color: "#888",
    fontSize: 14,
  },
});
