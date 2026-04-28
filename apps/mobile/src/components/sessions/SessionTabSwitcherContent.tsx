import { useCallback, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useEntityField } from "@trace/client-core";
import { EmptyState, ListRow, Spinner, Text } from "@/components/design-system";
import {
  useEnsureSessionGroupDetail,
  useSessionGroupSessionIds,
} from "@/hooks/useSessionGroupDetail";
import { createAgentTab } from "@/lib/createQuickSession";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme } from "@/theme";
import { SessionTabSwitcherRow } from "./SessionTabSwitcherRow";
import { SessionTerminalSwitcherRow } from "./SessionTerminalSwitcherRow";

interface SessionTabSwitcherContentProps {
  groupId: string;
  activeSessionId: string;
  activePane?: "session" | "terminal" | "browser";
  onClose?: () => void;
  closeDelayMs?: number;
  contentInset?: "none" | "sheet";
}

export function SessionTabSwitcherContent({
  groupId,
  activeSessionId,
  activePane = "session",
  onClose,
  closeDelayMs,
  contentInset = "none",
}: SessionTabSwitcherContentProps) {
  const router = useRouter();
  const theme = useTheme();
  const { loading, error } = useEnsureSessionGroupDetail(groupId);
  const groupName = useEntityField("sessionGroups", groupId, "name") as string | null | undefined;
  const activeSessionOptimistic = useEntityField("sessions", activeSessionId, "_optimistic") as
    | boolean
    | undefined;
  const sessionIds = useSessionGroupSessionIds(groupId);
  const [creating, setCreating] = useState(false);
  const navigationDelayMs = closeDelayMs ?? (onClose ? theme.motion.durations.fast : 0);

  const navigateToSession = useCallback(
    (sessionGroupId: string, targetId: string, pane: "session" | "terminal" = "session") => {
      onClose?.();
      if (targetId === activeSessionId && pane === activePane) return;
      const performNavigation = () => {
        useMobileUIStore.getState().setOverlaySessionId(targetId);
        const targetHref =
          pane === "session"
            ? (`/sessions/${sessionGroupId}/${targetId}` as never)
            : (`/sessions/${sessionGroupId}/${targetId}?pane=${pane}` as never);
        router.replace(targetHref);
      };
      if (navigationDelayMs > 0) {
        setTimeout(performNavigation, navigationDelayMs);
        return;
      }
      performNavigation();
    },
    [activePane, activeSessionId, navigationDelayMs, onClose, router],
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
    return count === 1 ? "1 open tab in this workspace." : `${count} open tabs in this workspace.`;
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
          subtitle={error ?? "This workspace's tab list isn't available right now."}
        />
      </View>
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        contentInset === "sheet"
          ? {
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.lg,
              paddingBottom: theme.spacing.xl,
            }
          : null,
      ]}
    >
      <View style={styles.header}>
        <Text variant="headline">Tabs & terminals</Text>
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
            borderRadius: 14,
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

      {sessionIds.length > 0 ? (
        <View
          style={[
            styles.section,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.borderMuted,
              borderRadius: 14,
            },
          ]}
        >
          <View style={[styles.sectionHeader, { borderBottomColor: theme.colors.borderMuted }]}>
            <Text variant="footnote" color="mutedForeground">
              Terminals
            </Text>
          </View>
          {sessionIds.map((sessionId, index) => (
            <SessionTerminalSwitcherRow
              key={`terminal-${sessionId}`}
              sessionId={sessionId}
              active={sessionId === activeSessionId && activePane === "terminal"}
              separator={index < sessionIds.length - 1}
              onPress={() => navigateToSession(groupId, sessionId, "terminal")}
            />
          ))}
        </View>
      ) : null}

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
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.borderMuted,
              borderRadius: 14,
            },
          ]}
        >
          <View style={[styles.sectionHeader, { borderBottomColor: theme.colors.borderMuted }]}>
            <Text variant="footnote" color="mutedForeground">
              Agent tabs
            </Text>
          </View>
          {sessionIds.map((item, index) => (
            <SessionTabSwitcherRow
              key={item}
              sessionId={item}
              active={item === activeSessionId && activePane === "session"}
              separator={index < sessionIds.length - 1}
              onPress={() => navigateToSession(groupId, item)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    gap: 16,
    paddingBottom: 8,
  },
  header: {
    gap: 6,
  },
  section: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
