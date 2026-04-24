import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView, type SFSymbol } from "expo-symbols";
import {
  createBottomTabNavigator,
  type BottomTabNavigationOptions,
} from "@react-navigation/bottom-tabs";
import { useEntityField } from "@trace/client-core";
import type { Repo } from "@trace/gql";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  EmptyState,
  Screen,
  Spinner,
} from "@/components/design-system";
import { ActiveTodoStrip } from "@/components/sessions/ActiveTodoStrip";
import { BrowserPanel } from "@/components/sessions/BrowserPanel";
import { SessionPageHeader } from "@/components/sessions/SessionPageHeader";
import { SessionSurface } from "@/components/sessions/SessionSurface";
import { SessionTerminalPanel } from "@/components/sessions/SessionTerminalPanel";
import { resolveBrowserUrl } from "@/lib/browser";
import { closeSessionPlayer } from "@/lib/sessionPlayer";
import { useMobileUIStore } from "@/stores/ui";
import { useTheme } from "@/theme";
import {
  fetchSessionGroupDetail,
  useEnsureSessionGroupDetail,
  useSessionGroupSessionIds,
} from "@/hooks/useSessionGroupDetail";

type SessionBottomTabsParamList = {
  session: undefined;
  terminal: undefined;
  browser: undefined;
};

const SessionBottomTabs = createBottomTabNavigator<SessionBottomTabsParamList>();

function renderTabIcon(icon: SFSymbol): NonNullable<BottomTabNavigationOptions["tabBarIcon"]> {
  return ({ color, size }) => (
    <SymbolView
      name={icon}
      size={size}
      tintColor={color}
      resizeMode="scaleAspectFit"
    />
  );
}

const sessionIcon = renderTabIcon("text.bubble");
const browserIcon = renderTabIcon("globe");
const terminalIcon = renderTabIcon("chevron.left.forwardslash.chevron.right");

/**
 * Standalone mobile session page. Reuses the session surface building blocks
 * but keeps the session, browser, and terminal views inside a dedicated page
 * with its own bottom navigation instead of the old sheet-style overlay.
 */
export default function SessionStreamScreen() {
  const theme = useTheme();
  const { groupId, sessionId } = useLocalSearchParams<{
    groupId: string;
    sessionId: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const loadingGroup = useEnsureSessionGroupDetail(groupId);
  const sessionIds = useSessionGroupSessionIds(groupId);
  const activeMenuClose = useMobileUIStore((s) => s.activeMenuClose);
  const browserUrl = useMobileUIStore((s) => s.browserUrl);
  const browserUrlGroupId = useMobileUIStore((s) => s.browserUrlGroupId);
  const setBrowserUrl = useMobileUIStore((s) => s.setBrowserUrl);
  const hydratedGroupId =
    (useEntityField("sessions", sessionId, "sessionGroupId") as string | null | undefined)
    ?? groupId;
  const prUrl = useEntityField("sessionGroups", hydratedGroupId, "prUrl") as
    | string
    | null
    | undefined;
  const repo = useEntityField("sessionGroups", hydratedGroupId, "repo") as
    | Repo
    | null
    | undefined;
  const groupName = useEntityField("sessionGroups", hydratedGroupId, "name") as
    | string
    | null
    | undefined;
  const resolvedBrowserUrl = useMemo(
    () =>
      resolveBrowserUrl(
        browserUrlGroupId === hydratedGroupId ? browserUrl : null,
        prUrl,
        repo?.remoteUrl,
      ),
    [browserUrl, browserUrlGroupId, hydratedGroupId, prUrl, repo?.remoteUrl],
  );

  useEffect(() => {
    if (!groupId || !sessionId || sessionIds.length === 0) return;
    if (sessionIds.includes(sessionId)) return;
    router.replace(`/sessions/${groupId}/${sessionIds[0]}`);
  }, [groupId, router, sessionId, sessionIds]);

  const handleSelectSession = useCallback(
    (nextId: string) => {
      useMobileUIStore.getState().setOverlaySessionId(nextId);
      router.replace(`/sessions/${groupId}/${nextId}`);
    },
    [groupId, router],
  );
  const handleBrowserUrlChange = useCallback(
    (nextUrl: string) => {
      setBrowserUrl(nextUrl, hydratedGroupId);
    },
    [hydratedGroupId, setBrowserUrl],
  );
  const [overlayHeight, setOverlayHeight] = useState(0);
  const handleOverlayLayout = useCallback((e: LayoutChangeEvent) => {
    const nextHeight = e.nativeEvent.layout.height;
    setOverlayHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);
  const handleRetryGroup = useCallback(() => {
    const targetGroupId = hydratedGroupId || groupId;
    if (!targetGroupId) return;
    void fetchSessionGroupDetail(targetGroupId);
  }, [groupId, hydratedGroupId]);
  const tabBarHeight = 52 + insets.bottom;

  const showLoading = loadingGroup;
  const missingGroup = !showLoading && !groupName;

  return (
    <Screen
      edges={["left", "right"]}
      background="background"
      style={styles.root}
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View pointerEvents="box-none" style={styles.headerOverlay}>
        {showLoading ? null : (
          <View onLayout={handleOverlayLayout} style={{ paddingTop: insets.top }}>
            <SessionPageHeader
              groupId={hydratedGroupId}
              sessionId={sessionId}
              onBack={closeSessionPlayer}
            />
            <ActiveTodoStrip sessionId={sessionId} />
          </View>
        )}
      </View>

      <View style={styles.content}>
        {showLoading ? (
          <View style={styles.center}>
            <Spinner size="small" color="mutedForeground" />
          </View>
        ) : missingGroup ? (
          <View style={styles.center}>
            <EmptyState
              icon="exclamationmark.triangle"
              title="Couldn't load workspace"
              subtitle="The workspace couldn't be loaded. Try again or go back."
            />
            <View style={styles.retryButton}>
              <Button title="Retry" variant="secondary" onPress={handleRetryGroup} />
            </View>
          </View>
        ) : sessionIds.length === 0 ? (
          <View style={styles.center}>
            <EmptyState
              icon="bolt.horizontal"
              title="No sessions in this workspace"
              subtitle="This workspace has not started a session yet."
            />
          </View>
        ) : (
          <SessionBottomTabs.Navigator
            key={hydratedGroupId}
            initialRouteName="session"
            screenOptions={{
              headerShown: false,
              sceneStyle: { backgroundColor: theme.colors.background },
              tabBarActiveTintColor: theme.colors.foreground,
              tabBarInactiveTintColor: theme.colors.mutedForeground,
              tabBarHideOnKeyboard: true,
              tabBarStyle: [
                styles.tabBar,
                {
                  backgroundColor: theme.colors.surface,
                  borderTopColor: theme.colors.borderMuted,
                  height: tabBarHeight,
                  paddingBottom: insets.bottom,
                },
              ],
              tabBarItemStyle: styles.tabBarItem,
              tabBarLabelStyle: styles.tabBarLabel,
            }}
          >
            <SessionBottomTabs.Screen
              name="session"
              options={{ title: "Session", tabBarIcon: sessionIcon }}
            >
              {() => (
                <SessionSurface
                  sessionId={sessionId}
                  onSelectSession={handleSelectSession}
                  hideHeader
                />
              )}
            </SessionBottomTabs.Screen>
            <SessionBottomTabs.Screen
              name="terminal"
              options={{ title: "Terminal", tabBarIcon: terminalIcon }}
            >
              {() => (
                <View style={[styles.overlayPaddedScene, { paddingTop: overlayHeight }]}>
                  <SessionTerminalPanel sessionId={sessionId} />
                </View>
              )}
            </SessionBottomTabs.Screen>
            <SessionBottomTabs.Screen
              name="browser"
              options={{ title: "Browser", tabBarIcon: browserIcon }}
            >
              {() => (
                <View style={styles.overlayPaddedScene}>
                  <BrowserPanel
                    url={resolvedBrowserUrl}
                    onUrlChange={handleBrowserUrlChange}
                    topInset={overlayHeight}
                  />
                </View>
              )}
            </SessionBottomTabs.Screen>
          </SessionBottomTabs.Navigator>
        )}
      </View>

      {activeMenuClose ? (
        <Pressable
          accessibilityLabel="Dismiss menu"
          onPress={activeMenuClose}
          style={styles.menuScrim}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "relative",
  },
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  overlayPaddedScene: {
    flex: 1,
    minHeight: 0,
  },
  tabBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 0,
    shadowOpacity: 0,
    paddingTop: 8,
  },
  tabBarItem: {
    paddingVertical: 2,
  },
  tabBarLabel: {
    fontSize: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  retryButton: {
    marginTop: 16,
  },
  menuScrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
});
