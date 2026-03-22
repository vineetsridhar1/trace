import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "./stores/auth";
import { useUIStore } from "./stores/ui";
import { useDetailPanelStore } from "./stores/detail-panel";
import { AppSidebar } from "./components/AppSidebar";
import { ChannelView } from "./components/channel/ChannelView";
import { ChatView } from "./components/chat/ChatView";
import { SettingsPage } from "./components/settings/SettingsPage";
import { InboxView } from "./components/inbox/InboxView";
import { SessionGroupDetailView } from "./components/session/SessionGroupDetailView";
import { DetailPanel } from "./components/ui/detail-panel";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "./components/ui/sidebar";
import { TooltipProvider } from "./components/ui/tooltip";
import { Button } from "./components/ui/button";
import { useOrgEvents } from "./hooks/useOrgEvents";
import { useHistorySync } from "./hooks/useHistorySync";
import { useVisibilityRefresh } from "./hooks/useVisibilityRefresh";
import { useIsMobile } from "./hooks/use-mobile";
import { Toaster } from "./components/ui/sonner";
import { InstallBanner } from "./components/InstallBanner";
import { cn } from "./lib/utils";

export function App() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const activeChannelId = useUIStore((s) => s.activeChannelId);
  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

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
  const activePage = useUIStore((s) => s.activePage);
  const activeChatId = useUIStore((s) => s.activeChatId);
  const activeSessionGroupId = useUIStore((s) => s.activeSessionGroupId);
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);
  const isFullscreen = useDetailPanelStore((s) => s.isFullscreen);
  const isMobile = useIsMobile();

  const containerRef = useRef<HTMLDivElement>(null);

  const closePanel = useCallback(() => setActiveSessionId(null), [setActiveSessionId]);

  const [displayedSessionGroupId, setDisplayedSessionGroupId] = useState<string | null>(activeSessionGroupId);
  useEffect(() => {
    if (activeSessionGroupId) {
      setDisplayedSessionGroupId(activeSessionGroupId);
    }
  }, [activeSessionGroupId]);

  const hasSession = !!activeSessionGroupId;

  return (
    <TooltipProvider>
      <div
        className="flex h-dvh max-h-dvh min-h-dvh flex-col pt-[env(safe-area-inset-top)] bg-surface-deep"
        style={{ backgroundColor: "var(--trace-shell-bg, var(--th-surface-deep))" }}
      >
        <InstallBanner />
        <SidebarProvider className="min-h-0 flex-1 pl-2 pt-2">
          <AppSidebar />

          {/* Two-card container: main content + session panel */}
          <div ref={containerRef} className="flex w-full flex-1 overflow-hidden">
            {/* Main content card */}
            <div
              className={cn(
                "flex min-w-0 overflow-hidden rounded-tl-lg rounded-tr-lg border bg-background transition-[flex,border-color] duration-300 ease-in-out",
                hasSession && isFullscreen && !isMobile
                  ? "flex-[0_0_0%] border-transparent"
                  : "flex-[1_1_0%]",
              )}
            >
              <SidebarInset className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {activePage === "settings" ? (
                  <SettingsPage />
                ) : activePage === "inbox" ? (
                  <InboxView />
                ) : activeChatId ? (
                  <ChatView chatId={activeChatId} />
                ) : activeChannelId ? (
                  <ChannelView channelId={activeChannelId} />
                ) : (
                  <div className="flex h-full flex-col">
                    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
                      <SidebarTrigger />
                    </header>
                    <div className="flex flex-1 items-center justify-center">
                      <p className="text-sm text-muted-foreground">
                        Select a channel to get started
                      </p>
                    </div>
                  </div>
                )}
              </SidebarInset>
            </div>

            {/* Session panel card (separate card, same level) */}
            <DetailPanel
              isOpen={hasSession}
              onClose={closePanel}
              containerRef={containerRef}
              onClosed={() => setDisplayedSessionGroupId(null)}
            >
              {displayedSessionGroupId && (
                <SessionGroupDetailView sessionGroupId={displayedSessionGroupId} panelMode />
              )}
            </DetailPanel>
          </div>
        </SidebarProvider>
      </div>
    </TooltipProvider>
  );
}

function LoginPage() {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const setToken = useAuthStore((s) => s.setToken);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "auth:success") {
        if (e.data.token) {
          setToken(e.data.token);
        }
        fetchMe();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [fetchMe, setToken]);

  function openGithubLogin() {
    const w = 500;
    const h = 700;
    const left = window.screenX + (window.innerWidth - w) / 2;
    const top = window.screenY + (window.innerHeight - h) / 2;
    const apiUrl = import.meta.env.VITE_API_URL ?? "";
    window.open(
      `${apiUrl}/auth/github?origin=${encodeURIComponent(window.location.origin)}`,
      "github-login",
      `width=${w},height=${h},left=${left},top=${top}`,
    );
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-surface-deep">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold text-foreground">Trace</h1>
        <p className="text-muted-foreground">
          AI-native project management & development platform
        </p>
        <Button onClick={openGithubLogin} size="lg" className="gap-2">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          Sign in with GitHub
        </Button>
      </div>
    </div>
  );
}
