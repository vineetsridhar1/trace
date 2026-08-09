import { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import WebView, { type WebViewNavigation } from "react-native-webview";
import { Screen, Text } from "@/components/design-system";
import { isPlanNavigationAllowed, sandboxedPlanHtml } from "@/lib/plan-html";
import { alpha, useTheme } from "@/theme";

interface VisualPlanViewerProps {
  html: string;
}

/** Routed, full-screen reader for agent-authored visual-plan HTML. */
export function VisualPlanViewer({ html }: VisualPlanViewerProps) {
  const theme = useTheme();
  const router = useRouter();
  const source = useMemo(() => ({ html: sandboxedPlanHtml(html), baseUrl: "about:blank" }), [html]);
  const handleNavigation = useCallback(
    (request: WebViewNavigation) => isPlanNavigationAllowed(request.url),
    [],
  );

  return (
    <Screen edges={["top", "left", "right", "bottom"]}>
      <View style={styles.root}>
        <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={[
              styles.backButton,
              {
                backgroundColor: alpha(theme.colors.surface, 0.9),
                borderColor: alpha(theme.colors.foreground, 0.12),
              },
            ]}
          >
            <SymbolView
              name="chevron.left"
              size={16}
              tintColor={theme.colors.foreground}
              resizeMode="scaleAspectFit"
            />
            <Text variant="caption1">Back</Text>
          </Pressable>
          <Text variant="headline" style={styles.title}>
            Visual plan
          </Text>
          <View style={styles.headerSpacer} />
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
    </Screen>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  backButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 2,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  title: {
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: {
    width: 62,
  },
  webView: {
    flex: 1,
  },
});
