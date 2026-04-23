import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSubmitEditingEventData,
} from "react-native";
import { SymbolView } from "expo-symbols";
import WebView, { type WebViewNavigation } from "react-native-webview";
import { Text } from "@/components/design-system";
import { useTheme } from "@/theme";

interface BrowserPanelProps {
  url: string;
  onUrlChange: (url: string) => void;
}

export function BrowserPanel({ url, onUrlChange }: BrowserPanelProps) {
  const theme = useTheme();
  const webViewRef = useRef<WebView>(null);
  const [inputText, setInputText] = useState(url);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInputText(url);
  }, [url]);

  const handleNavStateChange = useCallback(
    (state: WebViewNavigation) => {
      setCanGoBack(state.canGoBack);
      setCanGoForward(state.canGoForward);
      setInputText(state.url);
      onUrlChange(state.url);
    },
    [onUrlChange],
  );

  const handleSubmit = useCallback(
    (e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
      let raw = e.nativeEvent.text.trim();
      if (!raw) return;
      if (!/^https?:\/\//i.test(raw)) {
        raw = `https://${raw}`;
      }
      setInputText(raw);
      if (raw === url) {
        webViewRef.current?.reload();
        return;
      }
      onUrlChange(raw);
    },
    [onUrlChange, url],
  );

  const handleBack = useCallback(() => {
    webViewRef.current?.goBack();
  }, []);

  const handleForward = useCallback(() => {
    webViewRef.current?.goForward();
  }, []);

  const handleReload = useCallback(() => {
    if (!url) return;
    webViewRef.current?.reload();
  }, [url]);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
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
            placeholder="Enter a URL"
          />
        </View>

        <Pressable
          onPress={handleReload}
          disabled={!url}
          accessibilityLabel={loading ? "Loading" : "Reload"}
          style={styles.navBtn}
        >
          <SymbolView
            name={loading ? "hourglass" : "arrow.clockwise"}
            size={16}
            tintColor={url ? theme.colors.foreground : theme.colors.mutedForeground}
            weight="medium"
            resizeMode="scaleAspectFit"
          />
        </Pressable>
      </View>

      {url ? (
        <WebView
          ref={webViewRef}
          source={{ uri: url }}
          style={styles.webView}
          onNavigationStateChange={handleNavStateChange}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          allowsInlineMediaPlayback
          sharedCookiesEnabled
          allowsBackForwardNavigationGestures
        />
      ) : (
        <View style={[styles.empty, { backgroundColor: theme.colors.surfaceDeep }]}>
          <Text variant="body" color="mutedForeground" align="center">
            Enter a URL above to browse the repo or PR.
          </Text>
        </View>
      )}
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
    paddingHorizontal: 24,
  },
});
