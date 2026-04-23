import { useCallback, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSubmitEditingEventData,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";
import WebView, { type WebViewNavigation } from "react-native-webview";
import { Text } from "@/components/design-system";
import { useTheme } from "@/theme";

interface BrowserPanelProps {
  /** Initial URL to load. Falls back to a blank page. */
  initialUrl?: string;
  /** Top inset matching the Session Player's glass header height. */
  topInset?: number;
}

/**
 * Embedded browser panel shown when the user swipes over to the browser page
 * in the Session Player. Renders a simple URL bar + back/forward/reload
 * controls on top of a full-screen WebView.
 */
export function BrowserPanel({ initialUrl, topInset = 0 }: BrowserPanelProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [url, setUrl] = useState(initialUrl ?? "");
  const [inputText, setInputText] = useState(initialUrl ?? "");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(false);
  const webViewRef = useRef<WebView>(null);

  const handleNavStateChange = useCallback((state: WebViewNavigation) => {
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
    setInputText(state.url);
    setUrl(state.url);
  }, []);

  const handleSubmit = useCallback(
    (e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
      let raw = e.nativeEvent.text.trim();
      if (!raw) return;
      // If it looks like a bare domain or path, prepend https://
      if (!/^https?:\/\//i.test(raw)) {
        raw = `https://${raw}`;
      }
      setUrl(raw);
      setInputText(raw);
    },
    [],
  );

  const handleBack = useCallback(() => webViewRef.current?.goBack(), []);
  const handleForward = useCallback(() => webViewRef.current?.goForward(), []);
  const handleReload = useCallback(() => webViewRef.current?.reload(), []);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.colors.background },
      ]}
    >
      {/* Spacer that matches the glass header above */}
      <View style={{ height: topInset }} />

      {/* Toolbar */}
      <View
        style={[
          styles.toolbar,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
            paddingHorizontal: theme.spacing.md,
            gap: theme.spacing.sm,
          },
        ]}
      >
        <Pressable
          onPress={handleBack}
          disabled={!canGoBack}
          accessibilityLabel="Go back"
          style={styles.navBtn}
        >
          <SymbolView
            name="chevron.left"
            size={18}
            tintColor={canGoBack ? theme.colors.foreground : theme.colors.mutedForeground}
            weight="medium"
            resizeMode="scaleAspectFit"
          />
        </Pressable>

        <Pressable
          onPress={handleForward}
          disabled={!canGoForward}
          accessibilityLabel="Go forward"
          style={styles.navBtn}
        >
          <SymbolView
            name="chevron.right"
            size={18}
            tintColor={canGoForward ? theme.colors.foreground : theme.colors.mutedForeground}
            weight="medium"
            resizeMode="scaleAspectFit"
          />
        </Pressable>

        <View
          style={[
            styles.urlBar,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderRadius: theme.radius.md,
            },
          ]}
        >
          <TextInput
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSubmit}
            returnKeyType="go"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            selectTextOnFocus
            style={[
              styles.urlInput,
              {
                color: theme.colors.foreground,
                fontSize: 13,
              },
            ]}
            placeholderTextColor={theme.colors.mutedForeground}
            placeholder="Enter a URL…"
          />
        </View>

        <Pressable
          onPress={handleReload}
          accessibilityLabel={loading ? "Stop loading" : "Reload"}
          style={styles.navBtn}
        >
          <SymbolView
            name={loading ? "xmark" : "arrow.clockwise"}
            size={16}
            tintColor={theme.colors.foreground}
            weight="medium"
            resizeMode="scaleAspectFit"
          />
        </Pressable>
      </View>

      {/* WebView */}
      {url ? (
        <WebView
          ref={webViewRef}
          source={{ uri: url }}
          style={styles.webView}
          onNavigationStateChange={handleNavStateChange}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          // Allow inline media so video previews work
          allowsInlineMediaPlayback
          // Share cookies with system so GitHub auth carries over
          sharedCookiesEnabled
          allowsBackForwardNavigationGestures
        />
      ) : (
        <View
          style={[
            styles.empty,
            { backgroundColor: theme.colors.surfaceDeep },
          ]}
        >
          <Text variant="body" color="mutedForeground">
            Enter a URL above to get started
          </Text>
        </View>
      )}

      {/* Bottom safe area */}
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  urlBar: {
    flex: 1,
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 10,
    overflow: "hidden",
  },
  urlInput: {
    flex: 1,
    padding: 0,
    margin: 0,
  },
  webView: {
    flex: 1,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
