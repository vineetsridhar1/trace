import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore, useEntityField, type AuthState } from "@trace/client-core";
import { useUIStore, type UIState } from "./stores/ui";
import { useDetailPanelStore, type DetailPanelState } from "./stores/detail-panel";
import { AppSidebar } from "./components/AppSidebar";
import { BridgeSyncHydrator } from "./components/BridgeSyncHydrator";
import { ChannelView } from "./components/channel/ChannelView";
import { ChatView } from "./components/chat/ChatView";
import { SettingsPage } from "./components/settings/SettingsPage";
import { NoOrgWelcome } from "./components/onboarding/NoOrgWelcome";
import { HomeView } from "./components/onboarding/HomeView";
import { InboxView } from "./components/inbox/InboxView";
import { ConnectionsView } from "./components/connections/ConnectionsView";
import { TicketsView } from "./components/tickets/TicketsView";
import { AgentDebugPage } from "./components/agent-debug/AgentDebugPage";
import { SessionGroupDetailView } from "./components/session/SessionGroupDetailView";
import { DetailPanel } from "./components/ui/detail-panel";
import { SidebarProvider, SidebarInset } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { useOrgEvents } from "./hooks/useOrgEvents";
import { useHistorySync } from "./hooks/useHistorySync";
import { useVisibilityRefresh } from "./hooks/useVisibilityRefresh";
import { useBridgePendingRequestToasts } from "./hooks/useBridgePendingRequestToasts";
import { useIsMobile } from "./hooks/use-mobile";
import { Toaster } from "./components/ui/sonner";
import { InstallBanner } from "./components/InstallBanner";
import { LoginPage } from "./components/auth/LoginPage";
import { cn } from "./lib/utils";
import { features } from "./lib/features";
import { createQuickSession } from "./lib/create-quick-session";

const SETTINGS_DETAIL_PANEL_MAX_RATIO = 0.45;

export function App() {
  const user = useAuthStore((s: AuthState) => s.user);
  const loading = useAuthStore((s: AuthState) => s.loading);
  const activeOrgId = useAuthStore((s: AuthState) => s.activeOrgId);
  const hasOrg = useAuthStore((s: AuthState) => s.orgMemberships.length > 0);
  const fetchMe = useAuthStore((s: AuthState) => s.fetchMe);
  const activeChannelId = useUIStore((s: UIState) => s.activeChannelId);
  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    if (!window.trace?.setBridgeAuthContext) return;

    if (!user || !activeOrgId) {
      void window.trace.setBridgeAuthContext(null);
      return;
    }

    void window.trace.setBridgeAuthContext(activeOrgId);
  }, [activeOrgId, user]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-surface-deep">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (!hasOrg) {
    return (
      <>
        <NoOrgWelcome />
        <Toaster position="top-right" />
      </>
    );
  }

  return (
    <>
      <AuthenticatedApp activeChannelId={activeChannelId} />
      <Toaster position="top-right" />
    </>
  );
}

function AuthenticatedApp({ activeChannelId }: { activeChannelId: string | null }) {
  useOrgEvents();
  useHistorySync();
  useVisibilityRefresh();
  useBridgePendingRequestToasts();
  const activePage = useUIStore((s: UIState) => s.activePage);
  const activeChatId = useUIStore((s: UIState) => s.activeChatId);
  const setActiveChatId = useUIStore((s: UIState) => s.setActiveChatId);
  const setActiveChannelId = useUIStore((s: UIState) => s.setActiveChannelId);
  const activeSessionGroupId = useUIStore((s: UIState) => s.activeSessionGroupId);
  const setActiveSessionId = useUIStore((s: UIState) => s.setActiveSessionId);
  const isFullscreen = useDetailPanelStore((s: DetailPanelState) => s.isFullscreen);
  const isMobile = useIsMobile();
  const activeChannelType = useEntityField("channels", activeChannelId ?? "", "type");

  const containerRef = useRef<HTMLDivElement>(null);

  // Cmd+N / Ctrl+N: create a new session with smart defaults
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        const channelId = useUIStore.getState().activeChannelId;
        if (!channelId) return;
        createQuickSession(channelId);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const closePanel = useCallback(() => setActiveSessionId(null), [setActiveSessionId]);

  const [displayedSessionGroupId, setDisplayedSessionGroupId] = useState<string | null>(
    activeSessionGroupId,
  );
  useEffect(() => {
    if (activeSessionGroupId) {
      setDisplayedSessionGroupId(activeSessionGroupId);
    }
  }, [activeSessionGroupId]);

  useEffect(() => {
    if (features.messaging || !activeChatId) return;
    setActiveChatId(null);
  }, [activeChatId, setActiveChatId]);

  useEffect(() => {
    if (features.messaging) return;
    if (!activeChannelId || activeChannelType !== "text") return;
    setActiveChannelId(null);
  }, [activeChannelId, activeChannelType, setActiveChannelId]);

  const hasSession = !!activeSessionGroupId;
  const isMainContentCollapsed = hasSession && isFullscreen && !isMobile;
  const detailPanelMaxRatio = activePage === "settings" ? SETTINGS_DETAIL_PANEL_MAX_RATIO : undefined;
  const shouldRenderChatView = features.messaging && !!activeChatId;
  const shouldRenderChannelView =
    !!activeChannelId &&
    (features.messaging || (activeChannelType !== undefined && activeChannelType !== "text"));

  return (
    <TooltipProvider>
      <BridgeSyncHydrator />
      <div
        className="flex h-dvh max-h-dvh min-h-dvh flex-col pt-[env(safe-area-inset-top)] bg-surface-deep"
        style={{ backgroundColor: "var(--trace-shell-bg, var(--th-surface-deep))" }}
      >
        <InstallBanner />
        <SidebarProvider className="min-h-0 flex-1 pt-2">
          <AppSidebar />

          {/* Two-card container: main content + session panel */}
          <div
            ref={containerRef}
            className="flex w-full flex-1 overflow-hidden pl-2 pr-2 md:pl-0 md:peer-data-[state=collapsed]:pl-2"
          >
            {/* Main content card */}
            <div
              className={cn(
                "flex min-w-0 overflow-hidden rounded-tl-lg rounded-tr-lg border bg-background transition-[flex-grow,border-color] duration-300 ease-in-out",
                isMainContentCollapsed ? "border-0" : undefined,
              )}
              style={{
                flexBasis: "0%",
                flexGrow: isMainContentCollapsed ? 0 : 1,
                flexShrink: 1,
              }}
            >
              <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {activePage === "settings" ? (
                  <SettingsPage />
                ) : activePage === "agent-debug" && features.agentDebug ? (
                  <AgentDebugPage />
                ) : activePage === "inbox" ? (
                  <InboxView />
                ) : activePage === "connections" ? (
                  <ConnectionsView />
                ) : activePage === "tickets" && features.tickets ? (
                  <TicketsView />
                ) : shouldRenderChatView ? (
                  <ChatView chatId={activeChatId} />
                ) : shouldRenderChannelView ? (
                  <ChannelView channelId={activeChannelId} />
                ) : (
                  <HomeView />
                )}
              </SidebarInset>
            </div>

            {/* Session panel card (separate card, same level) */}
            <DetailPanel
              isOpen={hasSession}
              onClose={closePanel}
              containerRef={containerRef}
              maxRatio={detailPanelMaxRatio}
              onClosed={() => setDisplayedSessionGroupId(null)}
            >
              {displayedSessionGroupId && (
                <SessionGroupDetailView
                  key={displayedSessionGroupId}
                  sessionGroupId={displayedSessionGroupId}
                  panelMode
                />
              )}
            </DetailPanel>
          </div>
        </SidebarProvider>
      </div>
    </TooltipProvider>
  );
}
