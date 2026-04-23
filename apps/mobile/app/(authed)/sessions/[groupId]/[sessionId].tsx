import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  createNativeBottomTabNavigator,
  type NativeBottomTabNavigationOptions,
} from "@bottom-tabs/react-navigation";
import { useEntityField } from "@trace/client-core";
import type { Repo } from "@trace/gql";
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  EmptyState,
  Screen,
  Spinner,
} from "@/components/design-system";
import { ActiveTodoStrip } from "@/components/sessions/ActiveTodoStrip";
import { SessionBottomAccessory } from "@/components/sessions/SessionBottomAccessory";
import { BrowserPanel } from "@/components/sessions/BrowserPanel";
import { SessionPageHeader } from "@/components/sessions/SessionPageHeader";
import { SessionSurface } from "@/components/sessions/SessionSurface";
import { SessionTerminalPanel } from "@/components/sessions/SessionTerminalPanel";
import { closeSessionPlayer } from "@/lib/sessionPlayer";
import { useMobileUIStore } from "@/stores/ui";
import {
  useEnsureSessionGroupDetail,
  useSessionGroupSessionIds,
} from "@/hooks/useSessionGroupDetail";

type SessionBottomTabsParamList = {
  session: undefined;
  browser: undefined;
  terminal: undefined;
};

type SessionBottomTabName = keyof SessionBottomTabsParamList;

const SessionBottomTabs = createNativeBottomTabNavigator<SessionBottomTabsParamList>();

const sessionIcon: NonNullable<NativeBottomTabNavigationOptions["tabBarIcon"]> = () => ({
  sfSymbol: "text.bubble",
});

const browserIcon: NonNullable<NativeBottomTabNavigationOptions["tabBarIcon"]> = () => ({
  sfSymbol: "globe",
});

const terminalIcon: NonNullable<NativeBottomTabNavigationOptions["tabBarIcon"]> = () => ({
  sfSymbol: "chevron.left.forwardslash.chevron.right",
});

/**
 * Standalone mobile session page. Reuses the session surface building blocks
 * but keeps the session, browser, and terminal views inside a dedicated page
 * with its own bottom navigation instead of the old sheet-style overlay.
 */
export default function SessionStreamScreen() {
  const { groupId, sessionId } = useLocalSearchParams<{
    groupId: string;
    sessionId: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const loadingGroup = useEnsureSessionGroupDetail(groupId);
  const sessionIds = useSessionGroupSessionIds(groupId);
  const activeMenuClose = useMobileUIStore((s) => s.activeMenuClose);
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
  const defaultBrowserUrl = useMemo(() => {
    if (prUrl) return prUrl;
    const remoteUrl = repo?.remoteUrl;
    if (!remoteUrl) return "";
    const sshMatch = remoteUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (sshMatch) return `https://${sshMatch[1]}/${sshMatch[2]}`;
    if (/^https?:\/\//.test(remoteUrl)) return remoteUrl.replace(/\.git$/, "");
    return remoteUrl;
  }, [prUrl, repo?.remoteUrl]);
  const [browserUrl, setBrowserUrl] = useState(defaultBrowserUrl);

  useEffect(() => {
    if (!groupId || !sessionId || sessionIds.length === 0) return;
    if (sessionIds.includes(sessionId)) return;
    router.replace(`/sessions/${groupId}/${sessionIds[0]}`);
  }, [groupId, router, sessionId, sessionIds]);

  useEffect(() => {
    setBrowserUrl(defaultBrowserUrl);
  }, [defaultBrowserUrl, hydratedGroupId]);
  const useBottomAccessoryInput =
    Platform.OS === "ios"
    && (typeof Platform.Version === "number"
      ? Platform.Version >= 26
      : Number.parseInt(String(Platform.Version), 10) >= 26);
  const [activeBottomTab, setActiveBottomTab] = useState<SessionBottomTabName>("session");
  const [bottomAccessoryHeight, setBottomAccessoryHeight] = useState(0);
  const [accessoryComposerOpen, setAccessoryComposerOpen] = useState(false);
  const [accessoryFocusRequest, setAccessoryFocusRequest] = useState(0);

  useEffect(() => {
    setAccessoryComposerOpen(false);
    setBottomAccessoryHeight(0);
    setActiveBottomTab("session");
  }, [sessionId]);

  useEffect(() => {
    if (activeBottomTab !== "session") {
      setAccessoryComposerOpen(false);
    }
  }, [activeBottomTab]);

  useEffect(() => {
    if (!useBottomAccessoryInput && bottomAccessoryHeight !== 0) {
      setBottomAccessoryHeight(0);
    }
  }, [bottomAccessoryHeight, useBottomAccessoryInput]);

  const handleSelectSession = useCallback(
    (nextId: string) => {
      router.replace(`/sessions/${groupId}/${nextId}`);
    },
    [groupId, router],
  );
  const [overlayHeight, setOverlayHeight] = useState(0);
  const handleOverlayLayout = useCallback((e: LayoutChangeEvent) => {
    const nextHeight = e.nativeEvent.layout.height;
    setOverlayHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);
  const handleBottomAccessoryHeight = useCallback((nextHeight: number) => {
    setBottomAccessoryHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);
  const handleOpenAccessoryComposer = useCallback(() => {
    if (activeBottomTab !== "session") return;
    setAccessoryComposerOpen(true);
    setAccessoryFocusRequest((current) => current + 1);
  }, [activeBottomTab]);

  const showLoading = loadingGroup || (sessionIds.length === 0 && !groupName);

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
            minimizeBehavior="onScrollDown"
            translucent={false}
            scrollEdgeAppearance="opaque"
            renderBottomAccessoryView={
              useBottomAccessoryInput
                ? ({ placement }) => (
                    <SessionBottomAccessory
                      sessionId={sessionId}
                      activeTab={activeBottomTab}
                      placement={placement}
                      composerOpen={accessoryComposerOpen}
                      focusRequest={accessoryFocusRequest}
                      onComposerOpen={handleOpenAccessoryComposer}
                      onHeightChange={handleBottomAccessoryHeight}
                    />
                  )
                : undefined
            }
          >
            <SessionBottomTabs.Screen
              name="session"
              options={{ title: "Session", tabBarIcon: sessionIcon }}
              listeners={{ focus: () => setActiveBottomTab("session") }}
            >
              {() => (
                <SessionSurface
                  sessionId={sessionId}
                  onSelectSession={handleSelectSession}
                  hideHeader
                  useBottomAccessoryInput={useBottomAccessoryInput}
                  bottomAccessoryHeight={bottomAccessoryHeight}
                />
              )}
            </SessionBottomTabs.Screen>
            <SessionBottomTabs.Screen
              name="browser"
              options={{ title: "Browser", tabBarIcon: browserIcon }}
              listeners={{ focus: () => setActiveBottomTab("browser") }}
            >
              {() => (
                <View style={[styles.overlayPaddedScene, { paddingTop: overlayHeight }]}>
                  <BrowserPanel url={browserUrl} onUrlChange={setBrowserUrl} />
                </View>
              )}
            </SessionBottomTabs.Screen>
            <SessionBottomTabs.Screen
              name="terminal"
              options={{ title: "Terminal", tabBarIcon: terminalIcon }}
              listeners={{ focus: () => setActiveBottomTab("terminal") }}
            >
              {() => (
                <View style={[styles.overlayPaddedScene, { paddingTop: overlayHeight }]}>
                  <SessionTerminalPanel sessionId={sessionId} />
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  menuScrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
});
