import { useState, useEffect, useRef, useCallback } from 'react';
import { FiSettings, FiChevronDown, FiCheck, FiMenu } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import { useAppUIStore } from '../stores/appUIStore';
import type { Channel, ChannelType, MiddlePanelView } from '../types';

interface ChannelTopBarProps {
  panelTitle: string;
  channelType: ChannelType;
  workspacesEnabled: boolean;
  middlePanelView: MiddlePanelView;
  onSetView: (view: MiddlePanelView) => void;
  onOpenSettings: () => void;
  hasGithubUrl?: boolean;
  serverChannels: Channel[];
  activeChannelId: string | null;
  onSwitchChannel: (channelId: string) => void;
}

function ChannelDropdownItem({
  channel,
  isActive,
  onSelect,
}: {
  channel: Channel;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onSelect(channel.id); }}
      className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
        isActive
          ? 'bg-accent/20 text-accent-light'
          : 'text-muted hover:bg-surface-hover'
      }`}
    >
      {isActive ? (
        <FiCheck className="h-3 w-3 flex-shrink-0 text-accent" aria-hidden="true" />
      ) : (
        <span className="w-3 flex-shrink-0" />
      )}
      <span className="truncate">{channel.name}</span>
    </button>
  );
}

const TYPE_ORDER: ChannelType[] = ['team', 'project', 'channel'];
const TYPE_LABELS: Record<ChannelType, string> = {
  team: 'Teams',
  project: 'Projects',
  channel: 'Channels',
};

export function ChannelTopBar({
  panelTitle,
  channelType,
  workspacesEnabled,
  middlePanelView,
  onSetView,
  hasGithubUrl,
  onOpenSettings,
  serverChannels,
  activeChannelId,
  onSwitchChannel,
}: ChannelTopBarProps) {
  const showTracker = channelType === 'team' || channelType === 'project';
  const showProjects = channelType === 'team';
  const showWorkspaces = showTracker && workspacesEnabled;
  const showPRs = showWorkspaces && hasGithubUrl;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const handleSelect = useCallback(
    (channelId: string) => {
      onSwitchChannel(channelId);
      setDropdownOpen(false);
    },
    [onSwitchChannel],
  );

  // Group channels by type
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    channels: serverChannels.filter((ch) => ch.type === type),
  })).filter((g) => g.channels.length > 0);

  return (
    <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-edge px-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => useAppUIStore.getState().setMobileDrawerOpen(true)}
          className="mobile-hamburger-btn hidden rounded p-1 text-muted hover:bg-surface-elevated hover:text-primary"
        >
          <FiMenu className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={`flex cursor-pointer items-center gap-1 text-sm font-semibold transition-colors ${
              dropdownOpen
                ? 'text-accent-light'
                : 'text-accent-light hover:text-accent-light'
            }`}
          >
            {panelTitle}
            <FiChevronDown
              className={`h-3.5 w-3.5 opacity-60 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full mt-1 w-56 rounded-md border border-edge bg-surface-elevated py-1 shadow-lg z-50 max-h-80 overflow-y-auto">
              {grouped.map((group, gi) => (
                <div key={group.type}>
                  {gi > 0 && <div className="my-1 border-t border-edge" />}
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
                    {group.label}
                  </div>
                  {group.channels.map((ch) => (
                    <ChannelDropdownItem
                      key={ch.id}
                      channel={ch}
                      isActive={ch.id === activeChannelId}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {channelType !== 'channel' && (
        <div className="channel-topbar-views flex rounded-lg bg-surface-elevated p-0.5">
          <button
            type="button"
            onClick={() => onSetView('chat')}
            className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium ${
              middlePanelView === 'chat'
                ? 'bg-accent/20 text-accent-light'
                : 'btn-ghost text-muted hover:text-primary'
            }`}
          >
            Chat
          </button>
          {showTracker && (
            <button
              type="button"
              onClick={() => onSetView('board')}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium ${
                middlePanelView === 'board'
                  ? 'bg-accent/20 text-accent-light'
                  : 'btn-ghost text-muted hover:text-primary'
              }`}
            >
              Tracker
            </button>
          )}
          {showProjects && (
            <button
              type="button"
              onClick={() => onSetView('projects')}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium ${
                middlePanelView === 'projects'
                  ? 'bg-accent/20 text-accent-light'
                  : 'btn-ghost text-muted hover:text-primary'
              }`}
            >
              Projects
            </button>
          )}
          {showWorkspaces && (
            <button
              type="button"
              onClick={() => onSetView('workspaces')}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium ${
                middlePanelView === 'workspaces'
                  ? 'bg-accent/20 text-accent-light'
                  : 'btn-ghost text-muted hover:text-primary'
              }`}
            >
              Workspaces
            </button>
          )}
          {showWorkspaces && (
            <button
              type="button"
              onClick={() => onSetView('documents')}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium ${
                middlePanelView === 'documents'
                  ? 'bg-accent/20 text-accent-light'
                  : 'btn-ghost text-muted hover:text-primary'
              }`}
            >
              Docs
            </button>
          )}
          {showPRs && (
            <button
              type="button"
              onClick={() => onSetView('pull-requests')}
              className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium ${
                middlePanelView === 'pull-requests'
                  ? 'bg-accent/20 text-accent-light'
                  : 'btn-ghost text-muted hover:text-primary'
              }`}
            >
              PRs
            </button>
          )}
        </div>
        )}
        <Tooltip text="Channel settings" position="bottom">
          <button
            type="button"
            onClick={onOpenSettings}
            className="btn-ghost cursor-pointer rounded p-1 text-muted hover:text-primary"
          >
            <FiSettings className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
