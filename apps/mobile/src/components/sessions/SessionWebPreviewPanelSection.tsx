import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useRouter } from "expo-router";
import { Button, Spinner, Text } from "@/components/design-system";
import { useSessionGroupWebPreview } from "@/hooks/useSessionGroupWebPreview";
import { useTheme } from "@/theme";

function describeReason(reason: string | null | undefined): string {
  switch (reason) {
    case "missing_repo_port":
      return "Set a web preview port for this repo in settings.";
    case "runtime_disconnected":
      return "Reconnect this bridge to open the preview.";
    case "not_synced_to_main_worktree":
      return "Sync this session to the main worktree first.";
    case "no_matching_tunnel":
      return "Add a public tunnel slot that targets this repo port.";
    case "tunnel_inactive":
      return "Start the matching tunnel from Connections to preview this app.";
    case "not_local_runtime":
      return "Web preview is only available on local Electron bridges.";
    case "missing_repo":
      return "This session group is not attached to a repo.";
    default:
      return "Preview is not available for this session yet.";
  }
}

export function SessionWebPreviewPanelSection({ groupId }: { groupId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { preview, loading } = useSessionGroupWebPreview(groupId);

  return (
    <View
      style={[
        styles.container,
        {
          borderTopColor: theme.colors.border,
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.md,
          marginTop: theme.spacing.sm,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <SymbolView
            name="safari"
            size={15}
            tintColor={theme.colors.mutedForeground}
          />
          <Text variant="subheadline">Preview</Text>
        </View>
        {loading ? <Spinner size="small" color="mutedForeground" /> : null}
      </View>

      {preview?.available && preview.url ? (
        <>
          <Text variant="footnote" color="mutedForeground" numberOfLines={2}>
            {preview.url}
          </Text>
          <View style={styles.actions}>
            <Button
              title="Open Preview"
              size="sm"
              onPress={() => router.push(`/sessions/${groupId}/preview`)}
            />
          </View>
        </>
      ) : (
        <Text variant="footnote" color="mutedForeground">
          {describeReason(preview?.reason)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actions: {
    paddingTop: 4,
    alignItems: "flex-start",
  },
});
