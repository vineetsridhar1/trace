import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, withLayoutContext, useLocalSearchParams, useRouter } from "expo-router";
import {
  createNativeBottomTabNavigator,
  type NativeBottomTabNavigationEventMap,
  type NativeBottomTabNavigationOptions,
} from "@bottom-tabs/react-navigation";
import type {
  ParamListBase,
  TabNavigationState,
} from "@react-navigation/native";
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
import { SessionPageHeader } from "@/components/sessions/SessionPageHeader";
import { SessionPageProvider } from "@/components/sessions/session-page/SessionPageContext";
import { resolveBrowserUrl } from "@/lib/browser";
import { closeSessionPlayer } from "@/lib/sessionPlayer";
import { useMobileUIStore } from "@/stores/ui";
import {
  fetchSessionGroupDetail,
  useEnsureSessionGroupDetail,
  useSessionGroupSessionIds,
} from "@/hooks/useSessionGroupDetail";

const BottomTabNavigator = createNativeBottomTabNavigator().Navigator;
const NativeTabs = withLayoutContext<
  NativeBottomTabNavigationOptions,
  typeof BottomTabNavigator,
  TabNavigationState<ParamListBase>,
  NativeBottomTabNavigationEventMap
>(BottomTabNavigator);

const sessionIcon: NonNullable<NativeBottomTabNavigationOptions["tabBarIcon"]> = () => ({
  sfSymbol: "text.bubble",
});

const browserIcon: NonNullable<NativeBottomTabNavigationOptions["tabBarIcon"]> = () => ({
  sfSymbol: "globe",
});

const terminalIcon: NonNullable<NativeBottomTabNavigationOptions["tabBarIcon"]> = () => ({
  sfSymbol: "chevron.left.forwardslash.chevron.right",
});

export default function SessionPageLayout() {
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
  const [overlayHeight, setOverlayHeight] = useState(0);

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
  const handleOverlayLayout = useCallback((e: LayoutChangeEvent) => {
    const nextHeight = e.nativeEvent.layout.height;
    setOverlayHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);
  const handleRetryGroup = useCallback(() => {
    const targetGroupId = hydratedGroupId || groupId;
    if (!targetGroupId) return;
    void fetchSessionGroupDetail(targetGroupId);
  }, [groupId, hydratedGroupId]);

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
            <SessionPageProvider
              value={{
                onBrowserUrlChange: handleBrowserUrlChange,
                onSelectSession: handleSelectSession,
                overlayHeight,
              resolvedBrowserUrl,
              sessionId,
            }}
          >
            <NativeTabs
              initialRouteName="index"
              minimizeBehavior="onScrollDown"
              scrollEdgeAppearance="transparent"
            >
              <NativeTabs.Screen
                name="index"
                options={{ title: "Session", tabBarIcon: sessionIcon }}
              />
              <NativeTabs.Screen
                name="terminal"
                options={{ title: "Terminal", tabBarIcon: terminalIcon }}
              />
              <NativeTabs.Screen
                name="browser"
                options={{ title: "Browser", tabBarIcon: browserIcon }}
              />
            </NativeTabs>
          </SessionPageProvider>
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
