import { useCallback, useMemo } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import WebView, { type WebViewNavigation } from "react-native-webview";
import { Text } from "@/components/design-system";
import { isPlanNavigationAllowed, sandboxedPlanHtml } from "@/lib/plan-html";
import { alpha, useTheme } from "@/theme";

interface VisualPlanViewerProps {
  html: string;
  visible: boolean;
  onClose: () => void;
}

/** A full-screen, isolated reader for agent-authored visual-plan HTML. */
export function VisualPlanViewer({ html, visible, onClose }: VisualPlanViewerProps) {
  const theme = useTheme();
  const source = useMemo(() => ({ html: sandboxedPlanHtml(html), baseUrl: "about:blank" }), [html]);
  const handleNavigation = useCallback(
    (request: WebViewNavigation) => isPlanNavigationAllowed(request.url),
    [],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Text variant="headline">Visual plan</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close visual plan"
            onPress={onClose}
            style={[
              styles.closeButton,
              {
                backgroundColor: alpha(theme.colors.surface, 0.9),
                borderColor: alpha(theme.colors.foreground, 0.12),
              },
            ]}
          >
            <Text variant="caption1">Close</Text>
          </Pressable>
        </View>
        <WebView
          source={source}
          originWhitelist={["about:blank"]}
          onShouldStartLoadWithRequest={handleNavigation}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          javaScriptEnabled
          javaScriptCanOpenWindowsAutomatically={false}
          setSupportMultipleWindows={false}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          mixedContentMode="never"
          style={styles.webView}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    minHeight: 56,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  closeButton: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  webView: {
    flex: 1,
  },
});
