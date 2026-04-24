import { useCallback, useMemo, useState } from "react";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useEntityField } from "@trace/client-core";
import { EmptyState, ListRow, Spinner, Text } from "@/components/design-system";
import { useEnsureSessionGroupDetail, useSessionGroupSessionIds } from "@/hooks/useSessionGroupDetail";
import { createAgentTab } from "@/lib/createQuickSession";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme } from "@/theme";
import { SessionTabSwitcherRow } from "./SessionTabSwitcherRow";

interface SessionTabSwitcherContentProps {
  groupId: string;
  activeSessionId: string;
  onClose?: () => void;
}

const ROW_HEIGHT = 68;

export function SessionTabSwitcherContent({
  groupId,
  activeSessionId,
  onClose,
}: SessionTabSwitcherContentProps) {
  const router = useRouter();
  const theme = useTheme();
  const loading = useEnsureSessionGroupDetail(groupId);
  const groupName = useEntityField("sessionGroups", groupId, "name") as string | null | undefined;
  const activeSessionOptimistic = useEntityField(
    "sessions",
    activeSessionId,
    "_optimistic",
  ) as boolean | undefined;
  const sessionIds = useSessionGroupSessionIds(groupId);
  const [creating, setCreating] = useState(false);

  const navigateToSession = useCallback(
    (sessionGroupId: string, targetId: string) => {
      onClose?.();
      if (targetId === activeSessionId) return;
      useMobileUIStore.getState().setOverlaySessionId(targetId);
      const targetHref = `/sessions/${sessionGroupId}/${targetId}` as never;
      router.replace(targetHref);
    },
    [activeSessionId, onClose, router],
  );

  const handleCreateAgentTab = useCallback(async () => {
    if (creating || activeSessionOptimistic) return;
    setCreating(true);
    try {
      await createAgentTab(activeSessionId, {
        navigate: navigateToSession,
      });
    } finally {
      setCreating(false);
    }
  }, [activeSessionId, activeSessionOptimistic, creating, navigateToSession]);

  const headerSubtitle = useMemo(() => {
    const count = sessionIds.length;
    if (count === 0) return "No agent tabs loaded yet.";
    return count === 1
      ? "1 open tab in this workspace."
      : `${count} open tabs in this workspace.`;
  }, [sessionIds.length]);

  if (loading && !groupName) {
    return (
      <View style={styles.center}>
        <Spinner size="small" color="mutedForeground" />
      </View>
    );
  }

  if (!groupName && !loading) {
    return (
      <View style={styles.center}>
        <EmptyState
          icon="rectangle.on.rectangle"
          title="Couldn't load tabs"
          subtitle="This workspace's tab list isn't available right now."
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text variant="headline">Agent tabs</Text>
        <Text variant="footnote" color="mutedForeground">
          {groupName ?? "Current workspace"}
        </Text>
        <Text variant="footnote" color="dimForeground">
          {headerSubtitle}
        </Text>
      </View>

      <View
        style={[
          styles.section,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.borderMuted,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <ListRow
          title={creating ? "Creating agent tab..." : "New agent tab"}
          subtitle={
            activeSessionOptimistic
              ? "Wait for the current session to finish loading."
              : "Start another agent in this workspace."
          }
          leading={
            creating ? (
              <Spinner size="small" color="mutedForeground" />
            ) : (
              <SymbolView
                name="plus.rectangle.on.rectangle"
                size={18}
                tintColor={theme.colors.foreground}
              />
            )
          }
          onPress={!creating && !activeSessionOptimistic ? handleCreateAgentTab : undefined}
          haptic="selection"
          separator={false}
        />
      </View>

      {sessionIds.length === 0 ? (
        <View style={styles.center}>
          <EmptyState
            icon="bolt.horizontal"
            title="No tabs yet"
            subtitle="Create a new agent tab to start another session in this workspace."
          />
        </View>
      ) : (
        <View
          style={[
            styles.section,
            styles.listSection,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.borderMuted,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          <FlashList
            data={sessionIds}
            renderItem={({ item, index }) => (
              <SessionTabSwitcherRow
                sessionId={item}
                active={item === activeSessionId}
                separator={index < sessionIds.length - 1}
                onPress={() => navigateToSession(groupId, item)}
              />
            )}
            keyExtractor={(item) => item}
            estimatedItemSize={ROW_HEIGHT}
            showsVerticalScrollIndicator={false}
            style={styles.list}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: 16,
  },
  header: {
    gap: 4,
  },
  section: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  listSection: {
    flex: 1,
    minHeight: ROW_HEIGHT * 2,
  },
  list: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
