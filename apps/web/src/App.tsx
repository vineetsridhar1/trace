import { useEffect, type CSSProperties, type ReactNode } from "react";
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
import { TicketsView } from "./components/tickets/TicketsView";
import { SearchResultsView } from "./components/search/SearchResultsView";
import { SessionGroupDetailView } from "./components/session/SessionGroupDetailView";
import { GlobalCommandPalette } from "./components/command/GlobalCommandPalette";
import { KeyboardShortcutsDialog } from "./components/command/KeyboardShortcutsDialog";
import { SidebarProvider, SidebarInset, useSidebar } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { useOrgEvents } from "./hooks/useOrgEvents";
import { useHistorySync } from "./hooks/useHistorySync";
import { useVisibilityRefresh } from "./hooks/useVisibilityRefresh";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useBridgePendingRequestToasts } from "./hooks/useBridgePendingRequestToasts";
import { Toaster } from "./components/ui/sonner";
import { TraceLoader } from "./components/ui/trace-loader";
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
  const isDesktopShell = typeof window.trace !== "undefined";

  useEffect(() => {
    document.documentElement.classList.toggle("trace-desktop-shell", isDesktopShell);
    document.body.classList.toggle("trace-desktop-shell", isDesktopShell);

    return () => {
      document.documentElement.classList.remove("trace-desktop-shell");
      document.body.classList.remove("trace-desktop-shell");
    };
  }, [isDesktopShell]);

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
      <div
        className={`flex h-dvh items-center justify-center ${
          isDesktopShell ? "[background:var(--trace-window-bg)]" : "bg-surface-deep"
        }`}
      >
        <TraceLoader label="Loading Trace" size={96} />
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
  useGlobalShortcuts();
  useBridgePendingRequestToasts();
  const activePage = useUIStore((s: UIState) => s.activePage);
  const activeChatId = useUIStore((s: UIState) => s.activeChatId);
  const setActiveChatId = useUIStore((s: UIState) => s.setActiveChatId);
  const setActiveChannelId = useUIStore((s: UIState) => s.setActiveChannelId);
  const activeSessionGroupId = useUIStore((s: UIState) => s.activeSessionGroupId);
  const activeChannelType = useEntityField("channels", activeChannelId ?? "", "type");

  // Cmd+N / Ctrl+N creates a public session; adding Shift creates a private one.
  // Cmd+, / Ctrl+, opens the settings page.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        const channelId = useUIStore.getState().activeChannelId;
        if (!channelId) return;
        createQuickSession(channelId, { visibility: e.shiftKey ? "private" : "public" });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        useUIStore.getState().setActivePage("settings");
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
  const isDesktopShell = typeof window.trace !== "undefined";

  return (
    <TooltipProvider>
      <BridgeSyncHydrator />
      <GlobalCommandPalette />
      <KeyboardShortcutsDialog />
      <div
        className={`flex h-dvh max-h-dvh min-h-dvh flex-col pt-[env(safe-area-inset-top)] ${
          isDesktopShell ? "[background:var(--trace-window-bg)]" : "bg-surface-deep"
        }`}
      >
        <SidebarProvider className="min-h-0 flex-1">
          <AppSidebar />

          <MainContentFrame>
            {activePage === "settings" ? (
              <SettingsPage />
            ) : activePage === "inbox" ? (
              <InboxView />
            ) : activePage === "search" ? (
              <SearchResultsView />
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
          </MainContentFrame>
          <AppTitleBar />
        </SidebarProvider>
      </div>
    </TooltipProvider>
  );
}

function MainContentFrame({ children }: { children: ReactNode }) {
  const { state, isMobile } = useSidebar();
  const style = {
    // On mobile the sidebar is an off-canvas sheet, so the desktop collapsed
    // offset (which reserves room for the sidebar rail) would push the header
    // content off-screen. Keep a small offset on mobile regardless of state.
    "--trace-header-title-offset": !isMobile && state === "collapsed" ? "20rem" : "1rem",
  } as CSSProperties;

  return (
    <div className="flex w-full flex-1 overflow-hidden" style={style}>
      <div className="flex min-w-0 flex-1 overflow-hidden rounded-tr-lg border border-border/80 bg-background/95">
        <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </SidebarInset>
      </div>
    </div>
  );
}
