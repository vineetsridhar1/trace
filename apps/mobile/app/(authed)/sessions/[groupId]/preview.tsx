import { useRef } from "react";
import { Linking, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import { Button, EmptyState, Spinner, Text } from "@/components/design-system";
import { useSessionGroupWebPreview } from "@/hooks/useSessionGroupWebPreview";
import { useTheme } from "@/theme";

export default function SessionGroupPreviewScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const theme = useTheme();
  const webViewRef = useRef<WebView>(null);
  const { preview, loading, refresh } = useSessionGroupWebPreview(groupId);
  const title = preview?.repo?.name ? `${preview.repo.name} Preview` : "Preview";

  async function openInBrowser() {
    if (!preview?.url) return;
    await Linking.openURL(preview.url);
  }

  async function copyUrl() {
    if (!preview?.url) return;
    await Clipboard.setStringAsync(preview.url);
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        {loading && !preview ? (
          <View style={styles.centered}>
            <Spinner size="small" color="mutedForeground" />
          </View>
        ) : preview?.available && preview.url ? (
          <>
            <View
              style={[
                styles.toolbar,
                {
                  borderBottomColor: theme.colors.border,
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.md,
                },
              ]}
            >
              <Text variant="footnote" color="mutedForeground" numberOfLines={1} style={styles.url}>
                {preview.url}
              </Text>
              <View style={styles.actions}>
                <Button title="Reload" size="sm" variant="secondary" onPress={() => webViewRef.current?.reload()} />
                <Button title="Browser" size="sm" variant="secondary" onPress={() => void openInBrowser()} />
                <Button title="Copy URL" size="sm" variant="secondary" onPress={() => void copyUrl()} />
              </View>
            </View>
            <WebView
              ref={webViewRef}
              source={{ uri: preview.url }}
              style={styles.webView}
              setSupportMultipleWindows={false}
              originWhitelist={["*"]}
            />
          </>
        ) : (
          <View style={styles.centered}>
            <EmptyState
              icon="safari"
              title="Preview unavailable"
              subtitle="The matching public tunnel is not ready for this session."
            />
            <View style={styles.emptyActions}>
              <Button title="Refresh" variant="secondary" onPress={() => void refresh()} />
              {preview?.url ? (
                <Button title="Open in Browser" variant="secondary" onPress={() => void openInBrowser()} />
              ) : null}
            </View>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  toolbar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  url: {
    flexShrink: 1,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  webView: {
    flex: 1,
  },
  emptyActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
});
