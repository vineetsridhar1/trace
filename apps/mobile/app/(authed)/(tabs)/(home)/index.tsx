import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import { EmptyState, Screen } from "@/components/design-system";
import { HomeSectionHeader } from "@/components/home/HomeSectionHeader";
import { HomeSessionRow } from "@/components/home/HomeSessionRow";
import { useHomeSections, type HomeSectionKind } from "@/hooks/useHomeSections";
import { refreshOrgData } from "@/hooks/useHydrate";
import { haptic } from "@/lib/haptics";

type HomeListItem =
  | { kind: "header"; section: HomeSectionKind; count: number }
  | { kind: "row"; sessionId: string };

export default function AuthedHome() {
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const userId = useAuthStore((s: AuthState) => s.user?.id ?? null);
  const logout = useAuthStore((s: AuthState) => s.logout);
  const sections = useHomeSections(userId);
  const [refreshing, setRefreshing] = useState(false);

  const { items, stickyHeaderIndices } = useMemo(() => {
    const out: HomeListItem[] = [];
    const sticky: number[] = [];
    for (const section of sections) {
      sticky.push(out.length);
      out.push({ kind: "header", section: section.kind, count: section.ids.length });
      for (const id of section.ids) {
        out.push({ kind: "row", sessionId: id });
      }
    }
    return { items: out, stickyHeaderIndices: sticky };
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
    <Screen edges={["left", "right"]}>
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        stickyHeaderIndices={stickyHeaderIndices}
        contentInsetAdjustmentBehavior="automatic"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        ListEmptyComponent={<HomeEmpty />}
      />
    </Screen>
  );
}

function renderItem({ item }: { item: HomeListItem }) {
  if (item.kind === "header") {
    return <HomeSectionHeader kind={item.section} count={item.count} />;
  }
  return <HomeSessionRow sessionId={item.sessionId} />;
}

function keyExtractor(item: HomeListItem): string {
  return item.kind === "header" ? `h:${item.section}` : `r:${item.sessionId}`;
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
});
