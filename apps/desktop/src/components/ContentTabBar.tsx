import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiMessageSquare,
  FiCheckSquare,
  FiFolder,
  FiFileText,
  FiGitPullRequest,
  FiMessageCircle,
  FiX,
  FiPlus,
  FiMenu,
  FiCpu,
  FiTerminal,
} from 'react-icons/fi';
import type { GlobalTab, GlobalTabType } from '../stores/tabStore';
import type { ChannelType } from '../types';
import { AddTabMenu } from './AddTabMenu';
import { TabPopover } from './TabPopover';
import { Tooltip } from './Tooltip';
import { useAppUIStore } from '../stores/appUIStore';
import { useTerminalStore } from '../stores/terminalStore';

// ─── Icon map ──────────────────────────────────────────────────────────
const TAB_ICONS: Record<GlobalTabType, typeof FiMessageSquare> = {
  thread: FiCpu,
  chat: FiMessageSquare,
  board: FiCheckSquare,
  projects: FiFolder,
  documents: FiFileText,
  'pull-requests': FiGitPullRequest,
  'ai-chat': FiMessageCircle,
  terminal: FiTerminal,
};

// ─── Props ─────────────────────────────────────────────────────────────
interface ContentTabBarProps {
  tabs: GlobalTab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCreateAiChat: () => void;
  channelType: ChannelType;
  workspacesEnabled: boolean;
  hasGithubUrl: boolean;
  hasRepoPath: boolean;
  activeChannelId: string | null;
  activeChannelName: string;
  onOpenViewTab: (viewType: GlobalTabType) => void;
}

// ─── Component ─────────────────────────────────────────────────────────
export function ContentTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onCreateAiChat,
  channelType,
  workspacesEnabled,
  hasGithubUrl,
  hasRepoPath,
  activeChannelId,
  activeChannelName,
  onOpenViewTab,
}: ContentTabBarProps) {
  const addMenuOpen = useAppUIStore((s) => s.addTabMenuOpen);
  const ptyProcesses = useTerminalStore((s) => s.ptyProcesses);
  const tabRefsMap = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Scroll the active tab into view when it changes
  useEffect(() => {
    if (!activeTabId) return;
    const el = tabRefsMap.current.get(activeTabId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  const setTabRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) tabRefsMap.current.set(id, el);
    else tabRefsMap.current.delete(id);
  }, []);

  // Determine which view tabs are already open for the active channel
  const openTabTypes = useMemo(
    () => new Set(
      tabs
        .filter((t) => t.channelId === activeChannelId && t.type !== 'thread' && t.type !== 'ai-chat')
        .map((t) => t.type),
    ),
    [tabs, activeChannelId],
  );

  // ─── Tab hover popover ──────────────────────────────────────
  const [hoveredTab, setHoveredTab] = useState<GlobalTab | null>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTabMouseEnter = useCallback((tab: GlobalTab, el: HTMLButtonElement) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      setPopoverRect(rect);
      setHoveredTab(tab);
    }, 400);
  }, []);

  const handleTabMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    setHoveredTab(null);
    setPopoverRect(null);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  return (
    <div className="flex h-[40px] shrink-0 items-center border-b border-edge bg-surface-deep">
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => useAppUIStore.getState().setMobileDrawerOpen(true)}
        className="mobile-hamburger-btn hidden rounded p-1 ml-2 text-muted hover:bg-surface-elevated hover:text-primary"
      >
        <FiMenu className="h-4 w-4" aria-hidden="true" />
      </button>

      {/* Tab list */}
      <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-0 overflow-x-auto px-1">
        {tabs.map((tab) => {
          const Icon = TAB_ICONS[tab.type];
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              ref={(el) => setTabRef(tab.id, el)}
              type="button"
              onClick={() => {
                handleTabMouseLeave();
                onSelectTab(tab.id);
              }}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  handleTabMouseLeave();
                  onCloseTab(tab.id);
                }
              }}
              onMouseEnter={(e) => handleTabMouseEnter(tab, e.currentTarget)}
              onMouseLeave={handleTabMouseLeave}
              className={`group relative flex shrink-0 cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'text-accent-light'
                  : 'text-muted hover:text-primary'
              }`}
            >
              {isActive && (
                <span className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-accent" />
              )}
              <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[160px]">{tab.label}</span>
              {(() => {
                if (tab.type === 'terminal' && tab.channelId) {
                  const processInfo = ptyProcesses[`channel-terminal-${tab.channelId}`];
                  if (processInfo && !processInfo.isShellOnly) {
                    return (
                      <span className="flex items-center gap-1 text-[10px] text-green-400 font-mono">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                        {processInfo.processName}
                      </span>
                    );
                  }
                }
                return null;
              })()}
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }
                }}
                className="ml-0.5 rounded p-0.5 opacity-0 hover:bg-surface-elevated group-hover:opacity-100"
              >
                <FiX className="h-2.5 w-2.5" />
              </span>
            </button>
          );
        })}
      </div>

      {/* Add tab button — outside the overflow container so the dropdown isn't clipped */}
      <div className="relative shrink-0 px-1">
        <Tooltip text="Open a tab" position="bottom">
          <button
            type="button"
            onClick={() => useAppUIStore.getState().toggleAddTabMenuOpen()}
            className="flex cursor-pointer items-center rounded p-1 text-muted hover:bg-surface-elevated hover:text-primary"
          >
            <FiPlus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </Tooltip>
        {addMenuOpen && (
          <AddTabMenu
            openTabTypes={openTabTypes}
            channelType={channelType}
            workspacesEnabled={workspacesEnabled}
            hasGithubUrl={hasGithubUrl}
            hasRepoPath={hasRepoPath}
            onAddTab={(type) => {
              onOpenViewTab(type);
              useAppUIStore.getState().setAddTabMenuOpen(false);
            }}
            onCreateAiChat={() => {
              onCreateAiChat();
              useAppUIStore.getState().setAddTabMenuOpen(false);
            }}
            onClose={() => useAppUIStore.getState().setAddTabMenuOpen(false)}
          />
        )}
      </div>

      {/* Tab hover popover */}
      {hoveredTab && popoverRect && (
        <TabPopover tab={hoveredTab} triggerRect={popoverRect} />
      )}
    </div>
  );
}
