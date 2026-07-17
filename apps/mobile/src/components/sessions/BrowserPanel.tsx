import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { normalizeBrowserInputUrl } from "@/lib/browser";
import { useTheme } from "@/theme";

interface BrowserPanelProps {
  /** Current URL to load. Blank = empty state. */
  url: string;
  /** Lift browser navigation so the route can persist it across remounts. */
  onUrlChange: (url: string) => void;
  /** Refresh a managed preview after its backing runtime reports an HTTP failure. */
  onPreviewUnavailable?: () => void;
  /** Hide browser navigation for an immersive managed canvas. */
  showToolbar?: boolean;
  /** Suppress the design canvas's desktop-only HTML export control. */
  hideExportHtml?: boolean;
  /** Top inset matching the Session Player's glass header height. */
  topInset?: number;
}

/**
 * Embedded browser panel shown when the user swipes over to the browser page
 * in the Session Player. Renders a simple URL bar + back/forward/reload
 * controls on top of a full-screen WebView.
 */
export function BrowserPanel({
  url: nextUrl,
  onUrlChange,
  onPreviewUnavailable,
  showToolbar = true,
  hideExportHtml = false,
  topInset = 0,
}: BrowserPanelProps) {
  const theme = useTheme();
  const resolvedUrl = nextUrl;

  const [url, setUrl] = useState(resolvedUrl);
  const [inputText, setInputText] = useState(resolvedUrl);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [webViewRevision, setWebViewRevision] = useState(0);
  const webViewRef = useRef<WebView>(null);
  const latestUrlRef = useRef(resolvedUrl);
  const lastPropUrlRef = useRef(resolvedUrl);
  const lastReportedUrlRef = useRef(resolvedUrl);
  const onUrlChangeRef = useRef(onUrlChange);
  const webSource = useMemo(() => ({ uri: url }), [url]);

  useEffect(() => {
    if (resolvedUrl === lastPropUrlRef.current) return;
    lastPropUrlRef.current = resolvedUrl;
    if (resolvedUrl === latestUrlRef.current) return;
    setUrl(resolvedUrl);
    setInputText(resolvedUrl);
    setCanGoBack(false);
    setCanGoForward(false);
    setLoading(false);
    setLoadError(null);
  }, [resolvedUrl]);

  useEffect(() => {
    latestUrlRef.current = url;
  }, [url]);

  useEffect(() => {
    onUrlChangeRef.current = onUrlChange;
  }, [onUrlChange]);

  const reportUrlChange = useCallback((next: string) => {
    if (!next || next === lastReportedUrlRef.current) return;
    lastReportedUrlRef.current = next;
    onUrlChangeRef.current(next);
  }, []);

  useEffect(() => {
    return () => {
      if (latestUrlRef.current) onUrlChangeRef.current(latestUrlRef.current);
    };
  }, []);

  const handleNavStateChange = useCallback(
    (state: WebViewNavigation) => {
      latestUrlRef.current = state.url;
      setCanGoBack(state.canGoBack);
      setCanGoForward(state.canGoForward);
      setInputText(state.url);
      setUrl(state.url);
      reportUrlChange(state.url);
    },
    [reportUrlChange],
  );

  const handleSubmit = useCallback(
    (e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
      const raw = normalizeBrowserInputUrl(e.nativeEvent.text);
      if (!raw) return;
      latestUrlRef.current = raw;
      setUrl(raw);
      setInputText(raw);
      reportUrlChange(raw);
      if (raw === url) {
        webViewRef.current?.reload();
        return;
      }
    },
    [reportUrlChange, url],
  );

  const handleBack = useCallback(() => webViewRef.current?.goBack(), []);
  const handleForward = useCallback(() => webViewRef.current?.goForward(), []);
  const handleToolbarReload = useCallback(() => {
    if (loading) {
      webViewRef.current?.stopLoading();
      setLoading(false);
      return;
    }
    if (loadError) {
      setLoadError(null);
      setWebViewRevision((revision) => revision + 1);
      onPreviewUnavailable?.();
      return;
    }
    webViewRef.current?.reload();
  }, [loadError, loading, onPreviewUnavailable]);

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      {showToolbar ? <View style={{ height: topInset }} /> : null}

      {showToolbar ? (
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
          onPress={handleToolbarReload}
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
      ) : null}

      {url ? (
        loadError ? (
          <View style={[styles.empty, { backgroundColor: theme.colors.surfaceDeep }]}>
            <Text variant="body" color="mutedForeground" align="center">
              {loadError}
            </Text>
          </View>
        ) : (
          <WebView
            key={webViewRevision}
            ref={webViewRef}
            source={webSource}
            style={styles.webView}
            automaticallyAdjustContentInsets={false}
            contentInsetAdjustmentBehavior="never"
            onNavigationStateChange={handleNavStateChange}
            onLoadStart={() => {
              setLoadError(null);
              setLoading(true);
            }}
            onLoadEnd={() => setLoading(false)}
            onError={(event) => {
              setLoading(false);
              setLoadError(event.nativeEvent.description || "Couldn't load this page.");
            }}
            onHttpError={(event) => {
              setLoading(false);
              setLoadError(`Couldn't load this page (HTTP ${event.nativeEvent.statusCode}).`);
              onPreviewUnavailable?.();
            }}
            injectedJavaScriptBeforeContentLoaded={
              hideExportHtml
                ? `
                    (function () {
                      var removeExport = function () {
                        var exportLink = document.querySelector('a[href="/__trace_design_export"]');
                        if (exportLink) exportLink.remove();
                      };
                      var observe = function () {
                        if (!document.documentElement) {
                          setTimeout(observe, 0);
                          return;
                        }
                        new MutationObserver(removeExport).observe(document.documentElement, {
                          childList: true,
                          subtree: true,
                        });
                        removeExport();
                      };
                      observe();
                    })();
                    true;
                  `
                : undefined
            }
            allowsInlineMediaPlayback
            sharedCookiesEnabled
          />
        )
      ) : (
        <View style={[styles.empty, { backgroundColor: theme.colors.surfaceDeep }]}>
          <Text variant="body" color="mutedForeground">
            Enter a URL above to get started
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
  },
});
