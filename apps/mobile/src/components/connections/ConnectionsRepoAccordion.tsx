import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useRouter } from "expo-router";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";
import type { ConnectionRepoEntry } from "@/hooks/useConnections";
import { ConnectionsRepoSyncActions } from "./ConnectionsRepoSyncActions";

export function ConnectionsRepoAccordion({
  entry,
  runtimeInstanceId,
  onChanged,
}: {
  entry: ConnectionRepoEntry;
  runtimeInstanceId: string;
  onChanged: () => Promise<void>;
}) {
  const theme = useTheme();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const checkout = entry.linkedCheckout ?? null;
  const group = checkout?.attachedSessionGroup ?? null;
  const branch = checkout?.currentBranch ?? group?.branch ?? checkout?.targetBranch ?? null;
  const commit = checkout?.lastSyncedCommitSha ?? checkout?.currentCommitSha ?? null;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${entry.repo.name}, main worktree, ${expanded ? "expanded" : "collapsed"}`}
        accessibilityState={{ expanded }}
        onPress={() => {
          void haptic.light();
          setExpanded((value) => !value);
        }}
        style={({ pressed }) => [
          styles.header,
          {
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <SymbolView
          name={expanded ? "chevron.down" : "chevron.right"}
          size={13}
          tintColor={theme.colors.dimForeground}
        />
        <View style={styles.headerText}>
          <Text variant="body" color="foreground" numberOfLines={1}>
            {entry.repo.name}
          </Text>
          <Text variant="caption1" color="dimForeground" numberOfLines={1}>
            main worktree
          </Text>
        </View>
      </Pressable>

      {expanded ? (
        <View style={[styles.body, { paddingHorizontal: theme.spacing.lg }]}>
          {group ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open synced session ${group.name}${branch ? ` on ${branch}` : ""}`}
              onPress={() => router.push(`/sessions/${group.id}`)}
              style={({ pressed }) => [styles.syncedRow, { opacity: pressed ? 0.7 : 1 }]}
            >
              <SymbolView name="link" size={14} tintColor={theme.colors.mutedForeground} />
              <View style={styles.headerText}>
                <Text variant="body" color="foreground" numberOfLines={1}>
                  {group.name}
                </Text>
                <Text variant="caption1" color="mutedForeground" numberOfLines={1}>
                  {branch ?? "Synced session"}
                  {commit ? ` - ${commit.slice(0, 7)}` : ""}
                </Text>
              </View>
            </Pressable>
          ) : (
            <Text variant="footnote" color="mutedForeground">
              No synced session
            </Text>
          )}
          {checkout?.isAttached && checkout.attachedSessionGroupId ? (
            <ConnectionsRepoSyncActions
              checkout={checkout}
              runtimeInstanceId={runtimeInstanceId}
              onChanged={onChanged}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    paddingBottom: 14,
    gap: 8,
  },
  syncedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
});
