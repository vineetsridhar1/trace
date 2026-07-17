import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useEntityField } from "@trace/client-core";
import type { Repo } from "@trace/gql";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import PagerView from "react-native-pager-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, EmptyState, Screen, TraceLoader } from "@/components/design-system";
import { ActiveTodoStrip } from "@/components/sessions/ActiveTodoStrip";
import { BrowserPanel } from "@/components/sessions/BrowserPanel";
import { SessionPageHeader } from "@/components/sessions/SessionPageHeader";
import { SessionSurface } from "@/components/sessions/SessionSurface";
import { SessionTerminalPanel } from "@/components/sessions/SessionTerminalPanel";
import { resolveBrowserUrl } from "@/lib/browser";
import { dismissNotificationsForSession } from "@/lib/notifications";
import { closeSessionPlayer } from "@/lib/sessionPlayer";
import { useMobileUIStore } from "@/stores/ui";
import { alpha, useTheme } from "@/theme";
import { useAppPreview } from "@/hooks/useAppPreview";
import {
  fetchSessionGroupDetail,
  useEnsureSessionGroupDetail,
  useSessionGroupSessionIds,
} from "@/hooks/useSessionGroupDetail";
import { useSessionPorts } from "@/hooks/useSessionPorts";

type SessionPaneMode = "session" | "terminal" | "browser";

const HEADER_BLUR_INTENSITY = 3;
const HEADER_FADE_EXTRA_HEIGHT = 56;

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
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { loading: loadingGroup, error: groupError } = useEnsureSessionGroupDetail(groupId);
  const sessionIds = useSessionGroupSessionIds(groupId);
  const overlaySessionId = useMobileUIStore((s) => s.overlaySessionId);
  const activeMenuClose = useMobileUIStore((s) => s.activeMenuClose);
  const browserUrl = useMobileUIStore((s) => s.browserUrl);
  const browserUrlGroupId = useMobileUIStore((s) => s.browserUrlGroupId);
  const setBrowserUrl = useMobileUIStore((s) => s.setBrowserUrl);
  const pagerRef = useRef<PagerView>(null);
  const [appPage, setAppPage] = useState(pane === "browser" ? 1 : 0);
  const sessionOptimistic = useEntityField("sessions", sessionId, "_optimistic") as
    | boolean
    | undefined;
  const activePane: SessionPaneMode =
    pane === "terminal" ? "terminal" : pane === "browser" ? "browser" : "session";
  const hydratedGroupId =
    (useEntityField("sessions", sessionId, "sessionGroupId") as string | null | undefined) ??
    groupId;
  const prUrl = useEntityField("sessionGroups", hydratedGroupId, "prUrl") as
    | string
    | null
    | undefined;
  const repo = useEntityField("sessionGroups", hydratedGroupId, "repo") as Repo | null | undefined;
  const groupName = useEntityField("sessionGroups", hydratedGroupId, "name") as
    | string
    | null
    | undefined;
  const groupKind = useEntityField("sessionGroups", hydratedGroupId, "kind") as
    | string
    | null
    | undefined;
  const isGeneratedProjectGroup = groupKind === "app" || groupKind === "design";
  const generatedProjectLabel = groupKind === "design" ? "design" : "app";
  const {
    url: appPreviewUrl,
    loading: appPreviewLoading,
    error: appPreviewError,
    refresh: refreshAppPreview,
  } = useAppPreview(hydratedGroupId, isGeneratedProjectGroup);
  const resolvedBrowserUrl = useMemo(() => {
    const persistedUrl = browserUrlGroupId === hydratedGroupId ? browserUrl : null;
    if (isGeneratedProjectGroup) return persistedUrl || appPreviewUrl || "";
    return resolveBrowserUrl(persistedUrl, prUrl, repo?.remoteUrl);
  }, [
    appPreviewUrl,
    browserUrl,
    browserUrlGroupId,
    hydratedGroupId,
    isGeneratedProjectGroup,
    prUrl,
    repo?.remoteUrl,
  ]);
  useEffect(() => {
    if (!groupId || !sessionId || sessionIds.length === 0) return;
    if (sessionIds.includes(sessionId)) return;
    router.replace(`/sessions/${groupId}/${sessionIds[0]}`);
  }, [groupId, router, sessionId, sessionIds]);

  const navigateToPane = useCallback(
    (nextPane: SessionPaneMode) => {
      const basePath = `/sessions/${groupId}/${sessionId}`;
      const href = nextPane === "session" ? basePath : `${basePath}?pane=${nextPane}`;
      router.replace(href);
    },
    [groupId, router, sessionId],
  );
  const openBrowser = useCallback(() => {
    if (isGeneratedProjectGroup) {
      pagerRef.current?.setPage(1);
      setAppPage(1);
      return;
    }
    if (activePane === "browser") return;
    router.push(`/sessions/${groupId}/${sessionId}?pane=browser`);
  }, [activePane, groupId, isGeneratedProjectGroup, router, sessionId]);

  const handleSelectSession = useCallback(
    (nextId: string) => {
      useMobileUIStore.getState().setOverlaySessionId(nextId);
      setAppPage(0);
      router.replace(`/sessions/${groupId}/${nextId}`);
    },
    [groupId, router],
  );
  const handleBrowserUrlChange = useCallback(
    (nextUrl: string) => {
      if (browserUrlGroupId === hydratedGroupId && browserUrl === nextUrl) return;
      setBrowserUrl(nextUrl, hydratedGroupId);
    },
    [browserUrl, browserUrlGroupId, hydratedGroupId, setBrowserUrl],
  );
  const ignoreBrowserUrlChange = useCallback(() => undefined, []);
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
  const retryAppPreview = useCallback(() => {
    void refreshAppPreview();
  }, [refreshAppPreview]);

  const handoffPending =
    overlaySessionId !== null &&
    overlaySessionId !== sessionId &&
    hydratedGroupId === groupId &&
    !groupName;
  const showLoading = loadingGroup || handoffPending;
  const missingGroup = !showLoading && !groupName;
  const browserEnabled = !sessionOptimistic && !handoffPending && !showLoading;
  const headerPane: SessionPaneMode =
    activePane === "terminal"
      ? "terminal"
      : isGeneratedProjectGroup
        ? appPage === 1
          ? "browser"
          : "session"
        : activePane;
  useSessionPorts(sessionId, browserEnabled);

  useEffect(() => {
    if (!sessionId) return;
    void dismissNotificationsForSession(sessionId).catch((error) => {
      console.warn("[notifications] failed to dismiss session notification", error);
    });
  }, [sessionId]);

  return (
    <Screen edges={["left", "right"]} background="background" style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View pointerEvents="box-none" style={styles.headerOverlay}>
        {showLoading ? null : (
          <View onLayout={handleOverlayLayout} style={{ paddingTop: insets.top }}>
            <SessionPageHeader
              groupId={hydratedGroupId}
              sessionId={sessionId}
              activePane={headerPane}
              browserEnabled={browserEnabled}
              onOpenBrowser={openBrowser}
              onBack={
                activePane === "terminal"
                  ? () => navigateToPane("session")
                  : isGeneratedProjectGroup && appPage === 1
                    ? () => {
                        pagerRef.current?.setPage(0);
                        setAppPage(0);
                      }
                    : activePane === "browser"
                      ? () => router.back()
                      : closeSessionPlayer
              }
            />
            <ActiveTodoStrip sessionId={sessionId} />
          </View>
        )}
      </View>
      <View style={styles.content}>
        {showLoading ? (
          <View style={styles.center}>
            <TraceLoader size="small" color="mutedForeground" />
          </View>
        ) : missingGroup ? (
          <View style={styles.center}>
            <EmptyState
              icon="exclamationmark.triangle"
              title="Couldn't load workspace"
              subtitle={groupError ?? "The workspace couldn't be loaded. Try again or go back."}
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
            {isGeneratedProjectGroup && activePane !== "terminal" ? (
              <PagerView
                ref={pagerRef}
                initialPage={pane === "browser" ? 1 : 0}
                onPageSelected={(event) => setAppPage(event.nativeEvent.position)}
                overdrag
                style={styles.pager}
              >
                <View key="chat" style={styles.overlayPaddedScene}>
                  <SessionSurface
                    sessionId={sessionId}
                    onSelectSession={handleSelectSession}
                    hideHeader
                    topInset={overlayHeight}
                  />
                </View>
                <View key="browser" style={styles.overlayPaddedScene}>
                  {resolvedBrowserUrl ? (
                    <BrowserPanel
                      url={resolvedBrowserUrl}
                      onUrlChange={ignoreBrowserUrlChange}
                      onPreviewUnavailable={retryAppPreview}
                      topInset={overlayHeight}
                    />
                  ) : appPreviewLoading ? (
                    <View style={styles.center}>
                      <TraceLoader size="small" color="mutedForeground" />
                    </View>
                  ) : (
                    <View style={styles.center}>
                      <EmptyState
                        icon={appPreviewError ? "exclamationmark.triangle" : "globe"}
                        title={
                          appPreviewError
                            ? `Couldn't load the ${generatedProjectLabel}`
                            : `${generatedProjectLabel === "design" ? "Design" : "App"} is starting`
                        }
                        subtitle={
                          appPreviewError
                            ? appPreviewError
                            : `The canvas will appear when the ${generatedProjectLabel} is running.`
                        }
                        action={{
                          label: "Retry",
                          onPress: () => void refreshAppPreview(),
                        }}
                      />
                    </View>
                  )}
                </View>
              </PagerView>
            ) : activePane === "session" ? (
              <SessionSurface
                sessionId={sessionId}
                onSelectSession={handleSelectSession}
                hideHeader
                topInset={overlayHeight}
              />
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
            {activePane === "terminal" ? (
              <View style={[styles.overlayPaddedScene, { paddingTop: overlayHeight }]}>
                <SessionTerminalPanel sessionId={sessionId} />
              </View>
            ) : null}
          </View>
        )}
      </View>

      {!showLoading && !missingGroup && headerPane === "session" && overlayHeight > 0 ? (
        <>
          <BlurView
            pointerEvents="none"
            tint={theme.scheme === "dark" ? "systemThinMaterialDark" : "systemThinMaterial"}
            intensity={HEADER_BLUR_INTENSITY}
            style={[styles.headerBlur, { height: overlayHeight - 8 }]}
          />
          <LinearGradient
            pointerEvents="none"
            colors={[
              alpha(theme.colors.background, 1),
              alpha(theme.colors.background, 0.48),
              alpha(theme.colors.background, 0),
            ]}
            locations={[0, 0.68, 1]}
            style={[styles.headerFade, { height: overlayHeight + HEADER_FADE_EXTRA_HEIGHT }]}
          />
        </>
      ) : null}

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
  headerFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9,
  },
  headerBlur: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 8,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  overlayPaddedScene: {
    flex: 1,
    minHeight: 0,
  },
  pager: {
    flex: 1,
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
