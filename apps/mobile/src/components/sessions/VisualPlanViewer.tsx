import { useCallback, useMemo } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import WebView, { type WebViewNavigation } from "react-native-webview";
import { Screen } from "@/components/design-system";
import { FloatingBackButton } from "@/components/navigation/FloatingBackButton";
import { isPlanNavigationAllowed, sandboxedPlanHtml } from "@/lib/plan-html";
import { alpha, useTheme } from "@/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface VisualPlanViewerProps {
  html: string;
}

/** Routed, full-screen reader for agent-authored visual-plan HTML. */
export function VisualPlanViewer({ html }: VisualPlanViewerProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const source = useMemo(() => ({ html: sandboxedPlanHtml(html), baseUrl: "about:blank" }), [html]);
  const handleNavigation = useCallback(
    (request: WebViewNavigation) => isPlanNavigationAllowed(request.url),
    [],
  );

  return (
    <Screen edges={["left", "right"]}>
      <View style={styles.root}>
        <WebView
          source={source}
          originWhitelist={["about:blank"]}
          onShouldStartLoadWithRequest={handleNavigation}
          automaticallyAdjustContentInsets={false}
          contentInsetAdjustmentBehavior="never"
          javaScriptEnabled={false}
          javaScriptCanOpenWindowsAutomatically={false}
          setSupportMultipleWindows={false}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          mixedContentMode="never"
          style={styles.webView}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[
            alpha(theme.colors.background, 0.96),
            alpha(theme.colors.background, 0.5),
            alpha(theme.colors.background, 0),
          ]}
          locations={[0, 0.62, 1]}
          style={[styles.topGradient, { height: insets.top + 104 }]}
        />
        <View style={[styles.floatingBack, { top: insets.top + 12 }]}>
          <FloatingBackButton onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  topGradient: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  floatingBack: {
    left: 16,
    position: "absolute",
  },
});
