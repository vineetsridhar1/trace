import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { Channel, ChannelGroup } from "@trace/gql";
import type { TopLevelItem } from "../../hooks/useSidebarData";
import { features } from "../../lib/features";
import { BrowseChannelsDialog } from "./BrowseChannelsDialog";
import { CreateChannelDialog } from "./CreateChannelDialog";
import { GeneratedProjectsSection } from "./GeneratedProjectsSection";
import { DesignSystemsSection } from "./DesignSystemsSection";
import { HomeButton } from "./HomeButton";
import { InboxButton } from "./InboxButton";
import { TicketsButton } from "./TicketsButton";
import { SidebarChannelTree } from "./SidebarChannelTree";
import {
  readSidebarSessionScopes,
  toggleSidebarSessionScope,
  type SidebarSessionScopes,
} from "./sidebarSessionScopes";

const SIDEBAR_SESSION_SCOPE_EVENT = "trace:sidebar-session-scope-change";

export interface SidebarChannelsPaneProps {
  activeChannelId: string | null;
  activeSessionGroupId: string | null;
  activeOrgId: string | null;
  allChannelIds: string[];
  channelGroupsById: Record<string, ChannelGroup>;
  channelIdsByGroup: Record<string, string[]>;
  channelsById: Record<string, Channel>;
  channelsLoading: boolean;
  groupIds: string[];
  onChannelClick: (id: string) => void;
  onSessionClick: (channelId: string, sessionGroupId: string, sessionId: string | null) => void;
  onDragActiveChange?: (active: boolean) => void;
  topLevelItems: TopLevelItem[];
}

export function SidebarChannelsPane({
  activeChannelId,
  activeSessionGroupId,
  activeOrgId,
  allChannelIds,
  channelGroupsById,
  channelIdsByGroup,
  channelsById,
  channelsLoading,
  groupIds,
  onChannelClick,
  onSessionClick,
  onDragActiveChange,
  topLevelItems,
}: SidebarChannelsPaneProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForGroupId, setCreateForGroupId] = useState<string | null>(null);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [sessionScopes, setSessionScopes] =
    useState<SidebarSessionScopes>(readSidebarSessionScopes);

  useEffect(() => {
    const handleScopeChange = () => setSessionScopes(readSidebarSessionScopes());
    window.addEventListener(SIDEBAR_SESSION_SCOPE_EVENT, handleScopeChange);
    window.addEventListener("storage", handleScopeChange);
    return () => {
      window.removeEventListener(SIDEBAR_SESSION_SCOPE_EVENT, handleScopeChange);
      window.removeEventListener("storage", handleScopeChange);
    };
  }, []);

  const toggleSessionScope = useCallback((channelId: string) => {
    const nextScopes = toggleSidebarSessionScope(channelId);
    setSessionScopes(nextScopes);
    window.dispatchEvent(new Event(SIDEBAR_SESSION_SCOPE_EVENT));
  }, []);

  return (
    <section className="flex h-full min-w-full max-w-full shrink-0 snap-start snap-always flex-col overflow-hidden">
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <div className="space-y-0.5 pb-1">
          <HomeButton />
          <InboxButton />
          {features.tickets && <TicketsButton />}
        </div>

        <GeneratedProjectsSection
          activeOrgId={activeOrgId}
          activeSessionGroupId={activeSessionGroupId}
        />
        <DesignSystemsSection
          activeOrgId={activeOrgId}
          activeSessionGroupId={activeSessionGroupId}
        />

        <div className="group/projects-header flex items-center justify-between rounded-md pr-1 transition-colors hover:bg-white/10">
          <button
            type="button"
            aria-controls="sidebar-projects-list"
            aria-expanded={projectsExpanded}
            onClick={() => setProjectsExpanded((value) => !value)}
            className="flex flex-1 cursor-pointer items-center gap-1 rounded-md px-0 py-1 pl-2 text-left text-xs font-semibold uppercase tracking-wider text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight
              size={14}
              className={
                projectsExpanded
                  ? "shrink-0 rotate-90 transition-transform"
                  : "shrink-0 transition-transform"
              }
            />
            <span>Projects</span>
          </button>
          <div className="pointer-events-none flex items-center gap-0.5 opacity-0 transition-opacity group-hover/projects-header:pointer-events-auto group-hover/projects-header:opacity-100 group-focus-within/projects-header:pointer-events-auto group-focus-within/projects-header:opacity-100">
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

        <AnimatePresence initial={false}>
          {projectsExpanded ? (
            <motion.div
              id="sidebar-projects-list"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <SidebarChannelTree
                activeChannelId={activeChannelId}
                activeSessionGroupId={activeSessionGroupId}
                activeOrgId={activeOrgId}
                allChannelIds={allChannelIds}
                channelGroupsById={channelGroupsById}
                channelIdsByGroup={channelIdsByGroup}
                channelsById={channelsById}
                channelsLoading={channelsLoading}
                groupIds={groupIds}
                onToggleSessionScope={toggleSessionScope}
                onAddChannel={(groupId: string) => {
                  setCreateForGroupId(groupId);
                  setCreateDialogOpen(true);
                }}
                onChannelClick={onChannelClick}
                onSessionClick={onSessionClick}
                onDragActiveChange={onDragActiveChange}
                sessionScopes={sessionScopes}
                topLevelItems={topLevelItems}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
