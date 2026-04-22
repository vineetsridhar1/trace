import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import { EmptyState } from "@/components/design-system";
import { useTheme } from "@/theme";
import { HomeBridgesSection } from "@/components/home/HomeBridgesSection";
import { HomeRepoFilter } from "@/components/home/HomeRepoFilter";
import { HomeSectionHeader } from "@/components/home/HomeSectionHeader";
import { HomeSessionRow } from "@/components/home/HomeSessionRow";
import { useHomeSections, type HomeSectionKind } from "@/hooks/useHomeSections";
import { refreshOrgData } from "@/hooks/useHydrate";
import { useMyBridges } from "@/hooks/useMyBridges";
import { haptic } from "@/lib/haptics";
import { useMobileUIStore, type MobileUIState } from "@/stores/ui";

type HomeListItem =
  | { kind: "header"; section: HomeSectionKind; count: number }
  | { kind: "row"; sessionId: string };

export default function AuthedHome() {
  const theme = useTheme();
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const userId = useAuthStore((s: AuthState) => s.user?.id ?? null);
  const logout = useAuthStore((s: AuthState) => s.logout);
  const repoFilter = useMobileUIStore((s: MobileUIState) => s.homeRepoFilter);
  const sections = useHomeSections(userId, repoFilter);
  const { bridges, refresh: refreshBridges } = useMyBridges(activeOrgId);
  const [refreshing, setRefreshing] = useState(false);

  const items = useMemo<HomeListItem[]>(() => {
    const out: HomeListItem[] = [];
    for (const section of sections) {
      out.push({ kind: "header", section: section.kind, count: section.ids.length });
      for (const id of section.ids) {
        out.push({ kind: "row", sessionId: id });
      }
    }
    return out;
  }, [sections]);

  const handleRefresh = useCallback(async () => {
    if (!activeOrgId) return;
    void haptic.medium();
    setRefreshing(true);
    try {
      const [ok] = await Promise.all([refreshOrgData(activeOrgId), refreshBridges()]);
      if (!ok) {
        useEntityStore.getState().reset();
        await logout();
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeOrgId, logout, refreshBridges]);

  // Bridges status banner sits above the repo filter chips so it reads as
  // ambient status, not part of the filter UI.
  const ListHeader = useMemo(
    () => (
      <>
        {bridges.length > 0 ? <HomeBridgesSection bridges={bridges} /> : null}
        <HomeRepoFilter userId={userId} />
      </>
    ),
    [bridges, userId],
  );

  return (
    <FlashList
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemType={getItemType}
      contentInsetAdjustmentBehavior="automatic"
      onRefresh={handleRefresh}
      refreshing={refreshing}
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={<HomeEmpty hasRepoFilter={repoFilter !== null} />}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    />
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

function HomeEmpty({ hasRepoFilter }: { hasRepoFilter: boolean }) {
  return (
    <View style={styles.empty}>
      <EmptyState
        icon={hasRepoFilter ? "line.3.horizontal.decrease.circle" : "checkmark.seal"}
        title={hasRepoFilter ? "Nothing in this repo" : "All clear"}
        subtitle={
          hasRepoFilter
            ? "No sessions for the selected repo right now."
            : "Sessions that need you will show up here."
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingTop: 80,
  },
});
