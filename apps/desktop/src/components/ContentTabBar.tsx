import { useCallback, useEffect, useMemo, useRef } from 'react';
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
import { Tooltip } from './Tooltip';
import { useAppUIStore } from '../stores/appUIStore';

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
              onClick={() => onSelectTab(tab.id)}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onCloseTab(tab.id);
                }
              }}
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
    </div>
  );
}
