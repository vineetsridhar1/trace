import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
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
import { SessionBrowserRevealEdge } from "@/components/sessions/SessionBrowserRevealEdge";
import { SessionPageHeader } from "@/components/sessions/SessionPageHeader";
import { SessionSurface } from "@/components/sessions/SessionSurface";
import { SessionTerminalPanel } from "@/components/sessions/SessionTerminalPanel";
import { resolveBrowserUrl } from "@/lib/browser";
import { closeSessionPlayer } from "@/lib/sessionPlayer";
import { useMobileUIStore } from "@/stores/ui";
import {
  fetchSessionGroupDetail,
  useEnsureSessionGroupDetail,
  useSessionGroupSessionIds,
} from "@/hooks/useSessionGroupDetail";

type SessionPaneMode = "session" | "terminal" | "browser";

/**
 * Standalone mobile session page. Reuses the session surface building blocks
 * but keeps the session, browser, and terminal views inside a dedicated page
 * without introducing a second bottom navigation bar under the app tabs.
 */
export default function SessionStreamScreen() {
  const { groupId, sessionId, pane } = useLocalSearchParams<{
    groupId: string;
    sessionId: string;
    pane?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const loadingGroup = useEnsureSessionGroupDetail(groupId);
  const sessionIds = useSessionGroupSessionIds(groupId);
  const overlaySessionId = useMobileUIStore((s) => s.overlaySessionId);
  const activeMenuClose = useMobileUIStore((s) => s.activeMenuClose);
  const browserUrl = useMobileUIStore((s) => s.browserUrl);
  const browserUrlGroupId = useMobileUIStore((s) => s.browserUrlGroupId);
  const setBrowserUrl = useMobileUIStore((s) => s.setBrowserUrl);
  const activePane: SessionPaneMode =
    pane === "terminal" || pane === "browser" ? pane : "session";
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

  const navigateToPane = useCallback(
    (nextPane: SessionPaneMode) => {
      const basePath = `/sessions/${groupId}/${sessionId}`;
      const href =
        nextPane === "session" ? basePath : `${basePath}?pane=${nextPane}`;
      router.replace(href);
    },
    [groupId, router, sessionId],
  );

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

  const handoffPending =
    overlaySessionId !== null &&
    overlaySessionId !== sessionId &&
    hydratedGroupId === groupId &&
    !groupName;
  const showLoading = loadingGroup || handoffPending;
  const missingGroup = !showLoading && !groupName;

  return (
    <Screen
      edges={["left", "right"]}
      background="background"
      style={styles.root}
    >
      <Stack.Screen options={{ headerShown: false, gestureEnabled: activePane === "session" }} />

      <View pointerEvents="box-none" style={styles.headerOverlay}>
        {showLoading ? null : (
          <View onLayout={handleOverlayLayout} style={{ paddingTop: insets.top }}>
            <SessionPageHeader
              groupId={hydratedGroupId}
              sessionId={sessionId}
              activePane={activePane}
              onBack={activePane === "session" ? closeSessionPlayer : () => navigateToPane("session")}
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
          <View key={hydratedGroupId} style={styles.overlayPaddedScene}>
            {activePane === "session" ? (
              <>
                <SessionSurface
                  sessionId={sessionId}
                  onSelectSession={handleSelectSession}
                  hideHeader
                  topInset={overlayHeight}
                />
                <SessionBrowserRevealEdge
                  topInset={overlayHeight}
                  onOpen={() => navigateToPane("browser")}
                />
              </>
            ) : null}
            {activePane === "terminal" ? (
              <View style={[styles.overlayPaddedScene, { paddingTop: overlayHeight }]}>
                <SessionTerminalPanel sessionId={sessionId} />
              </View>
            ) : null}
            {activePane === "browser" ? (
              <View style={styles.overlayPaddedScene}>
                <BrowserPanel
                  url={resolvedBrowserUrl}
                  onUrlChange={handleBrowserUrlChange}
                  topInset={overlayHeight}
                />
              </View>
            ) : null}
          </View>
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
  retryButton: {
    marginTop: 16,
  },
  menuScrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
});
