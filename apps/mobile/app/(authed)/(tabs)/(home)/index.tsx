import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import { EmptyState } from "@/components/design-system";
import { useTheme } from "@/theme";
import { HomeRepoFilter } from "@/components/home/HomeRepoFilter";
import { HomeSectionHeader } from "@/components/home/HomeSectionHeader";
import { SessionGroupRow } from "@/components/channels/SessionGroupRow";
import { useHomeSections, type HomeSectionKind } from "@/hooks/useHomeSections";
import { refreshOrgData } from "@/hooks/useHydrate";
import { haptic } from "@/lib/haptics";
import { useMobileUIStore, type MobileUIState } from "@/stores/ui";

type HomeListItem =
  | { kind: "header"; section: HomeSectionKind; count: number }
  | { kind: "row"; groupId: string };

export default function AuthedHome() {
  const theme = useTheme();
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const userId = useAuthStore((s: AuthState) => s.user?.id ?? null);
  const logout = useAuthStore((s: AuthState) => s.logout);
  const repoFilter = useMobileUIStore((s: MobileUIState) => s.homeRepoFilter);
  const sections = useHomeSections(userId, repoFilter);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const items = useMemo<HomeListItem[]>(() => {
    const out: HomeListItem[] = [];
    for (const section of sections) {
      out.push({ kind: "header", section: section.kind, count: section.ids.length });
      for (const id of section.ids) {
        out.push({ kind: "row", groupId: id });
      }
    }
    return out;
  }, [sections]);

  useEffect(() => {
    if (!activeOrgId) {
      setLoadError(null);
      return;
    }
    void refreshOrgData(activeOrgId).then((result) => {
      if (!result.authorized) return;
      setLoadError(result.homeError);
    });
  }, [activeOrgId]);

  const handleRefresh = useCallback(async () => {
    if (!activeOrgId) return;
    void haptic.medium();
    setRefreshing(true);
    try {
      const result = await refreshOrgData(activeOrgId);
      if (!result.authorized) {
        useEntityStore.getState().reset();
        await logout();
        return;
      }
      setLoadError(result.homeError);
    } finally {
      setRefreshing(false);
    }
  }, [activeOrgId, logout]);

  const ListHeader = useMemo(
    () => <HomeRepoFilter userId={userId} />,
    [userId],
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
      ListEmptyComponent={
        <HomeEmpty
          hasRepoFilter={repoFilter !== null}
          error={loadError}
          onRetry={() => void handleRefresh()}
        />
      }
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    />
  );
}

function renderItem({ item }: { item: HomeListItem }) {
  if (item.kind === "header") {
    return <HomeSectionHeader kind={item.section} count={item.count} />;
  }
  return <SessionGroupRow groupId={item.groupId} hideStatusChip hideAvatar />;
}

function keyExtractor(item: HomeListItem): string {
  return item.kind === "header" ? `h:${item.section}` : `r:${item.groupId}`;
}

function getItemType(item: HomeListItem): string {
  return item.kind;
}

function HomeEmpty({
  hasRepoFilter,
  error,
  onRetry,
}: {
  hasRepoFilter: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <View style={styles.empty}>
      <EmptyState
        icon={
          error
            ? "exclamationmark.triangle"
            : hasRepoFilter
              ? "line.3.horizontal.decrease.circle"
              : "checkmark.seal"
        }
        title={error ? "Couldn't load home" : hasRepoFilter ? "Nothing in this repo" : "All clear"}
        subtitle={
          error
            ? error
            : hasRepoFilter
            ? "No sessions for the selected repo right now."
            : "Sessions that need you will show up here."
        }
        action={error ? { label: "Retry", onPress: onRetry } : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    paddingTop: 80,
  },
});
