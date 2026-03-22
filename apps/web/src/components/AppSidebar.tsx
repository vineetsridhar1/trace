import { Fragment, useCallback, useEffect, useRef, useState, type WheelEvent } from "react";
import { DndContext, DragOverlay, useDroppable } from "@dnd-kit/core";
import { gql } from "@urql/core";
import { Building2, Folder, Hash, MessageCircleMore, type LucideIcon } from "lucide-react";
import { useChannelDnd, customCollision, TOP_LEVEL_GAP_PREFIX } from "../hooks/useChannelDnd";
import { useSidebarData } from "../hooks/useSidebarData";
import { client } from "../lib/urql";
import { cn } from "../lib/utils";
import { useUIStore } from "../stores/ui";
import { BrowseChannelsDialog } from "./sidebar/BrowseChannelsDialog";
import { ChannelGroupSection } from "./sidebar/ChannelGroupSection";
import { ChannelItem } from "./sidebar/ChannelItem";
import { ChatItem } from "./sidebar/ChatItem";
import { CreateChannelDialog } from "./sidebar/CreateChannelDialog";
import { CreateChatDialog } from "./sidebar/CreateChatDialog";
import { InboxButton } from "./sidebar/InboxButton";
import { OrgSwitcher } from "./sidebar/OrgSwitcher";
import { PeekOverlay } from "./sidebar/PeekOverlay";
import { UserMenu } from "./sidebar/UserMenu";
import { Skeleton } from "./ui/skeleton";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from "./ui/sidebar";

const DELETE_GROUP_MUTATION = gql`
  mutation DeleteChannelGroup($id: ID!) {
    deleteChannelGroup(id: $id)
  }
`;

const DM_TAB_INDEX = 0;
const MAIN_TAB_INDEX = 1;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTabIndex(tab: "dm" | "main") {
  return tab === "dm" ? DM_TAB_INDEX : MAIN_TAB_INDEX;
}

function TopLevelDropIndicator({ index, isDragging }: { index: number; isDragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${TOP_LEVEL_GAP_PREFIX}${index}`,
    data: { type: "top-level-gap", index },
  });

  return (
    <div ref={setNodeRef} className="relative z-10 h-2 -my-1 overflow-visible">
      <div
        className={cn(
          "pointer-events-none absolute inset-x-2 top-1/2 z-10 -translate-y-1/2 rounded-full transition-all",
          isDragging
            ? isOver
              ? "h-0.5 bg-blue-500 opacity-100"
              : "h-px bg-border/80 opacity-100"
            : "h-px bg-transparent opacity-0",
        )}
      />
    </div>
  );
}

function SidebarTabButton({
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

export function AppSidebar() {
  const activePage = useUIStore((s) => s.activePage);
  const activeChannelId = useUIStore((s) => s.activeChannelId);
  const setActiveChannelId = useUIStore((s) => s.setActiveChannelId);
  const activeChatId = useUIStore((s) => s.activeChatId);
  const setActiveChatId = useUIStore((s) => s.setActiveChatId);
  const { state } = useSidebar();

  const [peeking, setPeeking] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForGroupId, setCreateForGroupId] = useState<string | null>(null);
  const [tabProgress, setTabProgress] = useState(MAIN_TAB_INDEX);

  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const hasInitializedTabsRef = useRef(false);
  const snapTimeoutRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const {
    activeOrgId,
    channelsLoading,
    chatsLoading,
    chatIds,
    allChannelIds,
    groupIds,
    channelIdsByGroup,
    topLevelItems,
    channelsById,
    channelGroupsById,
  } = useSidebarData();

  const {
    dragItem,
    dragOverGroupId,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
  } = useChannelDnd({ activeOrgId, topLevelItems, channelIdsByGroup, channelsById, channelGroupsById });

  useEffect(() => {
    if (state === "expanded") setPeeking(false);
  }, [state]);

  const syncTabProgress = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    const nextProgress = clamp(
      viewport.scrollLeft / Math.max(viewport.clientWidth, 1),
      DM_TAB_INDEX,
      MAIN_TAB_INDEX,
    );
    setTabProgress(nextProgress);
  }, []);

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
      return;
    }

    const startLeft = viewport.scrollLeft;
    const distance = targetLeft - startLeft;

    if (Math.abs(distance) < 1) {
      viewport.scrollLeft = targetLeft;
      setTabProgress(targetIndex);
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
    };

    animationFrameRef.current = window.requestAnimationFrame(step);
  }, [cancelScrollAnimation, clearPendingSnap]);

  const snapToNearestTab = useCallback(() => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    scrollToTab(
      viewport.scrollLeft / Math.max(viewport.clientWidth, 1) > 0.5 ? "main" : "dm",
    );
  }, [scrollToTab]);

  const scheduleTabSnap = useCallback((delay = 56) => {
    clearPendingSnap();

    snapTimeoutRef.current = window.setTimeout(() => {
      snapTimeoutRef.current = null;
      snapToNearestTab();
    }, delay);
  }, [clearPendingSnap, snapToNearestTab]);

  useEffect(() => {
    if (!hasInitializedTabsRef.current) {
      scrollToTab(activeChatId ? "dm" : "main", "auto");
      hasInitializedTabsRef.current = true;
      return;
    }

    if (activeChatId) {
      scrollToTab("dm");
      return;
    }

    if (activeChannelId || activePage === "inbox") {
      scrollToTab("main");
    }
  }, [activeChannelId, activeChatId, activePage, scrollToTab]);

  useEffect(() => {
    const handleResize = () => {
      scrollToTab(tabProgress < 0.5 ? "dm" : "main", "auto");
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [scrollToTab, tabProgress]);

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

  const isDragging = dragItem !== null;
  const backgroundBlend = tabProgress * 100;
  const dmSelectedness = 1 - tabProgress;
  const mainSelectedness = tabProgress;
  const currentTab = tabProgress > 0.5 ? "main" : "dm";

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--trace-shell-bg",
      `color-mix(in srgb, var(--th-surface-deep) ${backgroundBlend}%, var(--sidebar-dm))`,
    );

    return () => {
      document.documentElement.style.removeProperty("--trace-shell-bg");
    };
  }, [backgroundBlend]);

  return (
    <>
      <Sidebar collapsible="offcanvas" className="border-none">
        <div
          className="flex size-full flex-col"
          style={{
            backgroundColor: `color-mix(in srgb, var(--sidebar) ${backgroundBlend}%, var(--sidebar-dm))`,
          }}
        >
          <SidebarContent className="overflow-hidden">
            <div
              ref={scrollViewportRef}
              className="no-scrollbar flex size-full overflow-x-auto overflow-y-hidden overscroll-x-contain"
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
                <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 px-3">
                  <p className="truncate text-sm font-semibold text-sidebar-foreground">
                    Direct Messages
                  </p>
                  <CreateChatDialog />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  <SidebarGroup className="pt-3">
                    <SidebarGroupContent>
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
                              onClick={() => setActiveChatId(id)}
                            />
                          ))
                        )}
                      </SidebarMenu>

                      {!chatsLoading && chatIds.length === 0 && (
                        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                          No conversations yet
                        </p>
                      )}
                    </SidebarGroupContent>
                  </SidebarGroup>
                </div>
              </section>

              <section className="flex h-full min-w-full shrink-0 flex-col overflow-hidden">
                <div className="h-12 shrink-0 border-b border-border/70">
                  <OrgSwitcher />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                  <SidebarGroup>
                    <SidebarGroupContent>
                      <InboxButton />
                    </SidebarGroupContent>
                  </SidebarGroup>

                  <SidebarGroup>
                    <div className="flex items-center justify-between pr-1">
                      <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Channels
                      </SidebarGroupLabel>
                      <div className="flex items-center gap-0.5">
                        <BrowseChannelsDialog />
                        <CreateChannelDialog
                          open={createDialogOpen}
                          onOpenChange={setCreateDialogOpen}
                          defaultGroupId={createForGroupId}
                          onTriggerClick={() => {
                            setCreateForGroupId(null);
                            setCreateDialogOpen(true);
                          }}
                        />
                      </div>
                    </div>

                    <SidebarGroupContent>
                      {channelsLoading ? (
                        <SidebarMenu>
                          {Array.from({ length: 4 }).map((_, i) => (
                            <SidebarMenuItem key={i}>
                              <div className="flex items-center gap-2 px-2 py-1.5">
                                <Skeleton className="h-4 w-4 shrink-0 rounded" />
                                <Skeleton className="h-3.5 w-[60%]" />
                              </div>
                            </SidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      ) : (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={customCollision}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDragEnd={handleDragEnd}
                        >
                          <div className="py-2">
                            {topLevelItems.length > 0 && (
                              <>
                                <TopLevelDropIndicator index={0} isDragging={isDragging} />
                                {topLevelItems.map((item, index) => (
                                  <Fragment key={`${item.kind}:${item.id}`}>
                                    {item.kind === "channel" ? (
                                      <SidebarMenu>
                                        <ChannelItem
                                          id={item.id}
                                          isActive={item.id === activeChannelId}
                                          onClick={() => setActiveChannelId(item.id)}
                                          groupId={null}
                                        />
                                      </SidebarMenu>
                                    ) : (
                                      <ChannelGroupSection
                                        id={item.id}
                                        channelIds={channelIdsByGroup[item.id] ?? []}
                                        activeChannelId={activeChannelId}
                                        onChannelClick={setActiveChannelId}
                                        onAddChannel={(gid) => {
                                          setCreateForGroupId(gid);
                                          setCreateDialogOpen(true);
                                        }}
                                        onDeleteGroup={(gid) =>
                                          client.mutation(DELETE_GROUP_MUTATION, { id: gid }).toPromise()
                                        }
                                        isDropTarget={dragOverGroupId === item.id}
                                        isDragging={isDragging}
                                      />
                                    )}
                                    <TopLevelDropIndicator
                                      index={index + 1}
                                      isDragging={isDragging}
                                    />
                                  </Fragment>
                                ))}
                              </>
                            )}
                          </div>

                          <DragOverlay dropAnimation={null}>
                            {dragItem ? (
                              <div className="flex h-8 min-w-0 items-center gap-2 overflow-hidden rounded-md border border-border bg-sidebar-accent px-2 text-sm text-sidebar-accent-foreground shadow-lg">
                                {dragItem.type === "channel" ? (
                                  <Hash size={16} className="opacity-50" />
                                ) : (
                                  <Folder size={16} className="opacity-50" />
                                )}
                                <span className="truncate">{dragItem.name}</span>
                              </div>
                            ) : null}
                          </DragOverlay>
                        </DndContext>
                      )}

                      {!channelsLoading && allChannelIds.length === 0 && groupIds.length === 0 && (
                        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                          No channels yet
                        </p>
                      )}
                    </SidebarGroupContent>
                  </SidebarGroup>
                </div>
              </section>
            </div>
          </SidebarContent>

          <SidebarFooter className="gap-0 border-t border-border/70 p-0">
            <div className="px-3 py-2">
              <div className="flex items-center justify-center gap-1">
                <SidebarTabButton
                  icon={MessageCircleMore}
                  label="Direct messages"
                  selectedness={dmSelectedness}
                  isPressed={tabProgress < 0.5}
                  onClick={() => scrollToTab("dm")}
                />
                <SidebarTabButton
                  icon={Building2}
                  label="Organization channels"
                  selectedness={mainSelectedness}
                  isPressed={tabProgress >= 0.5}
                  onClick={() => scrollToTab("main")}
                />
              </div>
            </div>

            <div className="border-t border-border/70">
              <UserMenu />
            </div>
          </SidebarFooter>
        </div>
      </Sidebar>

      {state === "collapsed" && !peeking && (
        <div className="fixed inset-y-0 left-0 z-50 w-2" onMouseEnter={() => setPeeking(true)} />
      )}

      <PeekOverlay
        visible={peeking && state === "collapsed"}
        channelsLoading={channelsLoading}
        channelIds={allChannelIds}
        activeChannelId={activeChannelId}
        onChannelClick={setActiveChannelId}
        chatsLoading={chatsLoading}
        chatIds={chatIds}
        activeChatId={activeChatId}
        onChatClick={setActiveChatId}
        currentTab={currentTab}
        onTabProgressChange={setTabProgress}
        onTabChange={(tab) => scrollToTab(tab, "auto")}
        onMouseLeave={() => setPeeking(false)}
      />
    </>
  );
}
