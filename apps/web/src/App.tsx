import { useEffect } from "react";
import { useAuthStore, useEntityField, type AuthState } from "@trace/client-core";
import { useUIStore, type UIState } from "./stores/ui";
import { AppSidebar } from "./components/AppSidebar";
import { AppTitleBar } from "./components/AppTitleBar";
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
import { SidebarProvider, SidebarInset } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { useOrgEvents } from "./hooks/useOrgEvents";
import { useHistorySync } from "./hooks/useHistorySync";
import { useVisibilityRefresh } from "./hooks/useVisibilityRefresh";
import { useBridgePendingRequestToasts } from "./hooks/useBridgePendingRequestToasts";
import { Toaster } from "./components/ui/sonner";
import { InstallBanner } from "./components/InstallBanner";
import { LoginPage } from "./components/auth/LoginPage";
import { features } from "./lib/features";
import { createQuickSession } from "./lib/create-quick-session";

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
      <div className="flex h-dvh items-center justify-center bg-transparent">
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
  const activeChannelType = useEntityField("channels", activeChannelId ?? "", "type");

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

  useEffect(() => {
    if (features.messaging || !activeChatId) return;
    setActiveChatId(null);
  }, [activeChatId, setActiveChatId]);

  useEffect(() => {
    if (features.messaging) return;
    if (!activeChannelId || activeChannelType !== "text") return;
    setActiveChannelId(null);
  }, [activeChannelId, activeChannelType, setActiveChannelId]);

  const shouldRenderChatView = features.messaging && !!activeChatId;
  const shouldRenderChannelView =
    !!activeChannelId &&
    (features.messaging || (activeChannelType !== undefined && activeChannelType !== "text"));
  const shouldRenderSessionView = activePage === "main" && !!activeSessionGroupId;

  return (
    <TooltipProvider>
      <BridgeSyncHydrator />
      <div
        className="flex h-dvh max-h-dvh min-h-dvh flex-col pt-[env(safe-area-inset-top)] [background:var(--trace-window-bg)]"
      >
        <InstallBanner />
        <SidebarProvider className="min-h-0 flex-1 pt-2">
          <AppSidebar />

          <div className="app-region-drag flex w-full flex-1 overflow-hidden pt-10 md:peer-data-[state=collapsed]:pl-2">
            <div className="app-region-no-drag flex min-w-0 flex-1 overflow-hidden rounded-tl-lg border border-border/80 bg-background/95">
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
                ) : shouldRenderSessionView ? (
                  <SessionGroupDetailView
                    key={activeSessionGroupId}
                    sessionGroupId={activeSessionGroupId}
                  />
                ) : shouldRenderChannelView ? (
                  <ChannelView channelId={activeChannelId} />
                ) : (
                  <HomeView />
                )}
              </SidebarInset>
            </div>
          </div>
          <AppTitleBar />
        </SidebarProvider>
      </div>
    </TooltipProvider>
  );
}
