import { useCallback, useEffect, useRef, useState, type WheelEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, MessageCircleMore, type LucideIcon } from "lucide-react";
import { ChatItem } from "./ChatItem";
import { BrowseChannelsDialog } from "./BrowseChannelsDialog";
import { CreateChatDialog } from "./CreateChatDialog";
import { OrgSwitcher } from "./OrgSwitcher";
import { PeekChannelItem } from "./ChannelItem";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { InboxButton } from "./InboxButton";
import { UserMenu } from "./UserMenu";
import { SidebarMenu, SidebarMenuItem } from "../ui/sidebar";
import { Skeleton } from "../ui/skeleton";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTabIndex(tab: "dm" | "main") {
  return tab === "dm" ? 0 : 1;
}

function OverlayTabButton({
  icon: Icon,
  label,
  selectedness,
  isPressed,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  selectedness: number;
  isPressed: boolean;
  onClick: () => void;
}) {
  const mix = clamp(selectedness, 0, 1) * 100;

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isPressed}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
      style={{
        color: `color-mix(in srgb, #ffffff ${mix}%, #71717a)`,
      }}
    >
      <Icon size={14} strokeWidth={2.15} />
    </button>
  );
}

interface PeekOverlayProps {
  visible: boolean;
  channelsLoading: boolean;
  channelIds: string[];
  activeChannelId: string | null;
  onChannelClick: (id: string) => void;
  chatsLoading: boolean;
  chatIds: string[];
  activeChatId: string | null;
  onChatClick: (id: string) => void;
  currentTab: "dm" | "main";
  onTabProgressChange: (progress: number) => void;
  onTabChange: (tab: "dm" | "main") => void;
  onMouseLeave: () => void;
}

export function PeekOverlay({
  visible,
  channelsLoading,
  channelIds,
  activeChannelId,
  onChannelClick,
  chatsLoading,
  chatIds,
  activeChatId,
  onChatClick,
  currentTab,
  onTabProgressChange,
  onTabChange,
  onMouseLeave,
}: PeekOverlayProps) {
  const [tabProgress, setTabProgress] = useState(getTabIndex(currentTab));
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const snapTimeoutRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const wasVisibleRef = useRef(false);

  const syncTabProgress = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    const nextProgress = clamp(viewport.scrollLeft / Math.max(viewport.clientWidth, 1), 0, 1);
    setTabProgress(nextProgress);
    onTabProgressChange(nextProgress);
  }, [onTabProgressChange]);

  const clearPendingSnap = useCallback(() => {
    if (snapTimeoutRef.current !== null) {
      window.clearTimeout(snapTimeoutRef.current);
      snapTimeoutRef.current = null;
    }
  }, []);

  const cancelScrollAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const scrollToTab = useCallback((tab: "dm" | "main", behavior: ScrollBehavior = "smooth") => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    const targetIndex = getTabIndex(tab);
    const targetLeft = viewport.clientWidth * targetIndex;

    clearPendingSnap();
    cancelScrollAnimation();

    if (behavior === "auto") {
      viewport.scrollLeft = targetLeft;
      setTabProgress(targetIndex);
      onTabProgressChange(targetIndex);
      return;
    }

    const startLeft = viewport.scrollLeft;
    const distance = targetLeft - startLeft;

    if (Math.abs(distance) < 1) {
      viewport.scrollLeft = targetLeft;
      setTabProgress(targetIndex);
      onTabProgressChange(targetIndex);
      return;
    }

    const startTime = performance.now();
    const duration = 110;

    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);

      viewport.scrollLeft = startLeft + distance * eased;

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      animationFrameRef.current = null;
      viewport.scrollLeft = targetLeft;
      setTabProgress(targetIndex);
      onTabProgressChange(targetIndex);
    };

    animationFrameRef.current = window.requestAnimationFrame(step);
  }, [cancelScrollAnimation, clearPendingSnap, onTabProgressChange]);

  const finalizeTab = useCallback((tab: "dm" | "main") => {
    scrollToTab(tab);
    onTabChange(tab);
  }, [onTabChange, scrollToTab]);

  const snapToNearestTab = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    finalizeTab(viewport.scrollLeft / Math.max(viewport.clientWidth, 1) > 0.5 ? "main" : "dm");
  }, [finalizeTab]);

  const scheduleTabSnap = useCallback((delay = 56) => {
    clearPendingSnap();

    snapTimeoutRef.current = window.setTimeout(() => {
      snapTimeoutRef.current = null;
      snapToNearestTab();
    }, delay);
  }, [clearPendingSnap, snapToNearestTab]);

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      scrollToTab(currentTab, "auto");
    }

    wasVisibleRef.current = visible;
  }, [currentTab, scrollToTab, visible]);

  useEffect(() => {
    return () => {
      clearPendingSnap();
      cancelScrollAnimation();
    };
  }, [cancelScrollAnimation, clearPendingSnap]);

  const handleTrackpadWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    const horizontalDelta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.shiftKey
          ? event.deltaY
          : 0;

    if (horizontalDelta === 0) return;

    event.preventDefault();
    clearPendingSnap();
    cancelScrollAnimation();

    viewport.scrollLeft = clamp(
      viewport.scrollLeft + horizontalDelta,
      0,
      viewport.clientWidth,
    );
    syncTabProgress();
    scheduleTabSnap();
  }, [cancelScrollAnimation, clearPendingSnap, scheduleTabSnap, syncTabProgress]);

  const handleMouseLeave = useCallback(() => {
    clearPendingSnap();

    const nextTab = tabProgress > 0.5 ? "main" : "dm";
    onTabProgressChange(getTabIndex(nextTab));
    onTabChange(nextTab);
    onMouseLeave();
  }, [clearPendingSnap, onMouseLeave, onTabChange, onTabProgressChange, tabProgress]);

  const dmSelectedness = 1 - tabProgress;
  const mainSelectedness = tabProgress;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ x: "-100%" }}
          animate={{ x: 0 }}
          exit={{ x: "-100%" }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          onMouseLeave={handleMouseLeave}
          className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col bg-surface-deep shadow-2xl shadow-black/50 ring-1 ring-border/50"
          style={{
            margin: "8px",
            height: "calc(100% - 16px)",
            borderRadius: "12px",
            backgroundColor: `color-mix(in srgb, var(--sidebar) ${tabProgress * 100}%, var(--sidebar-dm))`,
          }}
        >
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl">
            <div
              ref={scrollViewportRef}
              className="no-scrollbar flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain"
              onScroll={syncTabProgress}
              onWheel={handleTrackpadWheel}
              onTouchStart={() => {
                clearPendingSnap();
                cancelScrollAnimation();
              }}
              onTouchEnd={snapToNearestTab}
              onTouchCancel={snapToNearestTab}
            >
              <section className="flex h-full min-w-full shrink-0 flex-col overflow-hidden">
                <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
                  <p className="truncate text-sm font-semibold text-sidebar-foreground">
                    Direct Messages
                  </p>
                  <CreateChatDialog />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                  <SidebarMenu>
                    {chatsLoading ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <SidebarMenuItem key={i}>
                          <div className="flex items-center gap-2 px-2 py-1.5">
                            <Skeleton className="h-4 w-4 shrink-0 rounded" />
                            <Skeleton className="h-3.5 w-[55%]" />
                          </div>
                        </SidebarMenuItem>
                      ))
                    ) : (
                      chatIds.map((id) => (
                        <ChatItem
                          key={id}
                          id={id}
                          isActive={id === activeChatId}
                          onClick={() => onChatClick(id)}
                        />
                      ))
                    )}
                  </SidebarMenu>

                  {!chatsLoading && chatIds.length === 0 && (
                    <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                      No conversations yet
                    </p>
                  )}
                </div>
              </section>

              <section className="flex h-full min-w-full shrink-0 flex-col overflow-hidden">
                <div className="border-b border-border">
                  <OrgSwitcher large />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                  <div className="mb-2">
                    <InboxButton />
                  </div>

                  <div className="mb-1 flex items-center justify-between px-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Channels
                    </span>
                    <div className="flex items-center gap-0.5">
                      <BrowseChannelsDialog />
                      <CreateChannelDialog />
                    </div>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    {channelsLoading ? (
                      Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2 px-4 py-1.5">
                          <Skeleton className="h-4 w-4 shrink-0 rounded" />
                          <Skeleton className="h-3.5 w-[60%]" />
                        </div>
                      ))
                    ) : (
                      channelIds.map((id) => (
                        <PeekChannelItem
                          key={id}
                          id={id}
                          isActive={id === activeChannelId}
                          onClick={() => onChannelClick(id)}
                        />
                      ))
                    )}

                    {!channelsLoading && channelIds.length === 0 && (
                      <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                        No channels yet
                      </p>
                    )}
                  </div>
                </div>
              </section>
            </div>

            <div className="px-3 py-2">
              <div className="flex items-center justify-center gap-1">
                <OverlayTabButton
                  icon={MessageCircleMore}
                  label="Direct messages"
                  selectedness={dmSelectedness}
                  isPressed={tabProgress < 0.5}
                  onClick={() => scrollToTab("dm")}
                />
                <OverlayTabButton
                  icon={Building2}
                  label="Organization channels"
                  selectedness={mainSelectedness}
                  isPressed={tabProgress >= 0.5}
                  onClick={() => scrollToTab("main")}
                />
              </div>
            </div>

            <div className="border-t border-border">
              <UserMenu />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
