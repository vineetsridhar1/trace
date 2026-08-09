import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, TextInput, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { FlashList } from "@shopify/flash-list";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useAuthStore, useEntityStore, type AuthState } from "@trace/client-core";
import { EmptyState, Glass, Skeleton, Text } from "@/components/design-system";
import { CreateCreationSheet } from "@/components/creations/CreateCreationSheet";
import { CreationRow } from "@/components/creations/CreationRow";
import { CreationsSectionHeader, type CreationSectionKind } from "@/components/creations/CreationsSectionHeader";
import { TopBarPill } from "@/components/navigation/TopBarPill";
import { useAppSessionGroups } from "@/hooks/useAppSessionGroups";
import { useDesignSessionGroups } from "@/hooks/useDesignSessionGroups";
import { buildCreationListItems, type CreationKindFilter, type CreationListItem } from "@/lib/app-sessions";
import { handleUnauthorized } from "@/lib/auth";
import { createApplication } from "@/lib/createQuickSession";
import { chooseDesignSystemAndCreate } from "@/lib/createDesignWithSystem";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";

type ListItem = { kind: "header"; section: CreationSectionKind; count: number } | { kind: "row"; creation: CreationListItem };

const FILTERS: Array<{ label: string; value: CreationKindFilter }> = [
  { label: "All", value: "all" },
  { label: "Apps", value: "app" },
  { label: "Designs", value: "design" },
];

export default function CreationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const user = useAuthStore((s: AuthState) => s.user);
  const apps = useAppSessionGroups(activeOrgId);
  const designs = useDesignSessionGroups(activeOrgId);
  const [filter, setFilter] = useState<CreationKindFilter>("all");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const creations = useStoreWithEqualityFn(
    useEntityStore,
    (state) => buildCreationListItems(state, filter, archived, query),
    sameCreations,
  );
  const loading = apps.loading || designs.loading;
  const error = apps.error ?? designs.error;
  const items = useMemo(() => buildListItems(creations, archived), [creations, archived]);

  const refresh = useCallback(async () => {
    void haptic.medium();
    setRefreshing(true);
    try {
      const [appResult, designResult] = await Promise.all([apps.refresh(), designs.refresh()]);
      if (!appResult.authorized || !designResult.authorized) await handleUnauthorized();
    } finally {
      setRefreshing(false);
    }
  }, [apps, designs]);

  const chooseFilter = useCallback((next: CreationKindFilter) => {
    void haptic.selection();
    setFilter(next);
  }, []);
  const openSearch = useCallback(() => setSearching(true), []);
  const closeSearch = useCallback(() => {
    setQuery("");
    setSearching(false);
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Glass preset="input" style={[styles.headerGlass, { borderColor: theme.colors.border }]}>
              <TopBarPill
                actions={[
                  { id: "search", symbol: searching ? "xmark" : "magnifyingglass", accessibilityLabel: searching ? "Close search" : "Search creations", onPress: searching ? closeSearch : openSearch },
                  { id: "new-creation", symbol: "plus", accessibilityLabel: "New creation", onPress: () => setCreating(true) },
                ]}
                avatar={user ? { name: user.name ?? user.email ?? "?", uri: user.avatarUrl, accessibilityLabel: "Account", onPress: () => router.push("/sheets/account") } : undefined}
              />
            </Glass>
          ),
        }}
      />
      <FlashList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={(item) => item.kind}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={theme.colors.mutedForeground} />}
        ListHeaderComponent={<CreationsListHeader searching={searching} query={query} onQueryChange={setQuery} onCancelSearch={closeSearch} filter={filter} archived={archived} error={error} onFilterChange={chooseFilter} onArchiveToggle={() => setArchived((value) => !value)} onRetry={() => void refresh()} />}
        ListEmptyComponent={loading ? <CreationLoading /> : <CreationsEmpty error={error} archived={archived} query={query} onCreate={() => setCreating(true)} onRetry={() => void refresh()} />}
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.colors.background }}
      />
      <CreateCreationSheet visible={creating} onClose={() => setCreating(false)} onCreateApp={() => void createApplication()} onCreateDesign={() => void chooseDesignSystemAndCreate(activeOrgId)} />
    </>
  );
}

function buildListItems(creations: CreationListItem[], archived: boolean): ListItem[] {
  const groups: Array<[CreationSectionKind, CreationListItem[]]> = archived
    ? [["archived", creations]]
    : [
        ["needs_input", creations.filter((item) => item.status === "needs_input")],
        ["in_progress", creations.filter((item) => item.status === "in_progress")],
        ["ready", creations.filter((item) => item.status !== "needs_input" && item.status !== "in_progress")],
      ];
  return groups.flatMap(([section, entries]) => entries.length ? [{ kind: "header" as const, section, count: entries.length }, ...entries.map((creation) => ({ kind: "row" as const, creation }))] : []);
}

function renderItem({ item }: { item: ListItem }) {
  return item.kind === "header" ? <CreationsSectionHeader kind={item.section} count={item.count} /> : <CreationRow groupId={item.creation.id} kind={item.creation.kind} />;
}

function keyExtractor(item: ListItem): string {
  return item.kind === "header" ? `header:${item.section}` : item.creation.id;
}

function CreationsListHeader({
  searching,
  query,
  onQueryChange,
  onCancelSearch,
  filter,
  archived,
  error,
  onFilterChange,
  onArchiveToggle,
  onRetry,
}: {
  searching: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  onCancelSearch: () => void;
  filter: CreationKindFilter;
  archived: boolean;
  error: string | null;
  onFilterChange: (value: CreationKindFilter) => void;
  onArchiveToggle: () => void;
  onRetry: () => void;
}) {
  const theme = useTheme();
  return (
    <>
      {searching ? (
        <View style={[styles.search, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <TextInput
            autoFocus
            accessibilityLabel="Search creations"
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search creations"
            placeholderTextColor={theme.colors.dimForeground}
            style={[styles.input, theme.typography.callout, { color: theme.colors.foreground }]}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel search" onPress={onCancelSearch} hitSlop={8}>
            <Text variant="subheadline" style={{ color: "#0a84ff", fontWeight: "600" }}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.filters} accessibilityRole="tablist">
        {FILTERS.map(({ label, value }) => {
          const selected = filter === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onFilterChange(value)}
              style={[styles.filter, { borderColor: selected ? "#0a84ff" : theme.colors.border, backgroundColor: theme.colors.surface }]}
            >
              <Text variant="subheadline" style={{ color: selected ? "#0a84ff" : theme.colors.mutedForeground, fontWeight: "600" }}>{label}</Text>
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" accessibilityLabel={archived ? "Show active creations" : "Show archived creations"} onPress={onArchiveToggle} style={styles.archiveToggle}>
          <Text variant="footnote" color="mutedForeground">{archived ? "Active" : "Archived"}</Text>
        </Pressable>
      </View>
      {error ? <OfflineNotice onRetry={onRetry} /> : null}
    </>
  );
}

function sameCreations(a: CreationListItem[], b: CreationListItem[]): boolean {
  return a.length === b.length && a.every((item, index) => item.id === b[index]?.id && item.status === b[index]?.status && item.name === b[index]?.name);
}

function CreationLoading() {
  const theme = useTheme();
  return <View style={styles.loading}>{[0, 1, 2, 3].map((key) => <View key={key} style={[styles.loadingRow, { borderColor: theme.colors.border }]}><Skeleton width={28} height={28} radius={14} /><View style={styles.loadingCopy}><Skeleton width="64%" height={17} /><Skeleton width="42%" height={12} style={{ marginTop: 8 }} /></View></View>)}</View>;
}

function OfflineNotice({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.offline, { borderColor: theme.colors.border }]}>
      <View style={styles.offlineCopy}>
        <Text variant="subheadline" style={{ fontWeight: "600" }}>You’re offline</Text>
        <Text variant="caption1" color="mutedForeground">Showing creations saved on this device.</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Retry connection" onPress={onRetry} style={styles.retry}>
        <Text variant="footnote" style={{ color: "#0a84ff", fontWeight: "600" }}>Retry</Text>
      </Pressable>
    </View>
  );
}

function CreationsEmpty({ error, archived, query, onCreate, onRetry }: { error: string | null; archived: boolean; query: string; onCreate: () => void; onRetry: () => void }) {
  if (error) return <EmptyState icon="wifi.exclamationmark" title="You’re offline" subtitle="Showing creations saved on this device. Pull to refresh or try again." action={{ label: "Retry", onPress: onRetry }} />;
  if (query) return <EmptyState icon="magnifyingglass" title="No matches" subtitle="Try another name or creation type." />;
  if (archived) return <EmptyState icon="archivebox" title="Nothing archived" subtitle="Archived apps and designs will appear here." />;
  return <EmptyState icon="square.grid.2x2" title="No creations yet" subtitle="Apps and designs you make with Trace will appear here." action={{ label: "New creation", onPress: onCreate }} />;
}

const styles = StyleSheet.create({
  headerGlass: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 2 },
  filters: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  filter: { minHeight: 44, justifyContent: "center", paddingHorizontal: 18, borderRadius: 999, borderWidth: 1 },
  archiveToggle: { minHeight: 44, justifyContent: "center", marginLeft: "auto", paddingLeft: 4 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 14, borderWidth: 1, borderRadius: 999 },
  input: { flex: 1, minWidth: 0, paddingVertical: 8 },
  loading: { paddingTop: 8 },
  loadingRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  loadingCopy: { flex: 1, gap: 0 },
  offline: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  offlineCopy: { flex: 1, gap: 2 },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
});
