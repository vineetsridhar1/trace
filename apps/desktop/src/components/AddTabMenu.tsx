import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiMessageSquare,
  FiCheckSquare,
  FiFolder,
  FiFileText,
  FiGitPullRequest,
  FiMessageCircle,
  FiTerminal,
} from 'react-icons/fi';
import { TAB_LABELS, VIEW_TAB_TYPES, isViewTabAvailable } from '../stores/tabStore';
import type { GlobalTabType } from '../stores/tabStore';
import type { ChannelType } from '../types';
import { useKeybindings, type KeyBinding } from '../hooks/useKeybindings';

interface AddTabMenuProps {
  openTabTypes: Set<GlobalTabType>;
  channelType: ChannelType;
  workspacesEnabled: boolean;
  hasGithubUrl: boolean;
  hasRepoPath: boolean;
  onAddTab: (type: GlobalTabType) => void;
  onCreateAiChat: () => void;
  onClose: () => void;
}

const VIEW_ICONS: Partial<Record<GlobalTabType, typeof FiMessageSquare>> = {
  chat: FiMessageSquare,
  board: FiCheckSquare,
  projects: FiFolder,
  documents: FiFileText,
  'pull-requests': FiGitPullRequest,
  terminal: FiTerminal,
};

export function AddTabMenu({
  openTabTypes,
  channelType,
  workspacesEnabled,
  hasGithubUrl,
  hasRepoPath,
  onAddTab,
  onCreateAiChat,
  onClose,
}: AddTabMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const availableViews = VIEW_TAB_TYPES.filter(
    (type) =>
      isViewTabAvailable(type, channelType, workspacesEnabled, hasGithubUrl, hasRepoPath) &&
      !openTabTypes.has(type),
  );

  const filterLower = filter.toLowerCase();
  const filteredViews = filterLower
    ? availableViews.filter((type) => TAB_LABELS[type].toLowerCase().includes(filterLower))
    : availableViews;

  const showAiChat = !filterLower || TAB_LABELS['ai-chat'].toLowerCase().includes(filterLower);

  // Build ordered list of all visible menu items for numbered shortcuts
  const menuItems = useMemo(() => {
    const items: Array<{ type: 'ai-chat' | GlobalTabType; action: () => void }> = [];
    if (showAiChat) items.push({ type: 'ai-chat', action: onCreateAiChat });
    for (const type of filteredViews) {
      items.push({ type, action: () => onAddTab(type) });
    }
    return items;
  }, [showAiChat, filteredViews, onCreateAiChat, onAddTab]);

  // Arrow key highlight index (-1 = none highlighted)
  const [highlightIndex, setHighlightIndex] = useState(-1);

  // Reset highlight when menu items change (e.g. filter typed)
  useEffect(() => {
    setHighlightIndex(-1);
  }, [menuItems.length]);

  // Register escape + number + arrow key bindings via the keybinding stack
  const bindings = useMemo<KeyBinding[]>(() => {
    const result: KeyBinding[] = [
      { keys: 'escape', callback: onClose },
      {
        keys: 'down',
        callback: () => setHighlightIndex((prev) => (prev + 1) % menuItems.length),
      },
      {
        keys: 'up',
        callback: () =>
          setHighlightIndex((prev) => (prev <= 0 ? menuItems.length - 1 : prev - 1)),
      },
      {
        keys: 'enter',
        callback: () => {
          if (highlightIndex >= 0 && highlightIndex < menuItems.length) {
            menuItems[highlightIndex].action();
          }
        },
      },
    ];
    for (let i = 0; i < menuItems.length && i < 9; i++) {
      const item = menuItems[i];
      result.push({
        keys: `${i + 1}`,
        callback: item.action,
        ignoreTextInputs: true,
      });
    }
    return result;
  }, [onClose, menuItems, highlightIndex]);

  useKeybindings(bindings);

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full z-50 mt-1 w-52 rounded-md border border-edge bg-surface-elevated py-1 shadow-lg"
    >
      <div className="px-2 pb-1">
        <input
          ref={inputRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter..."
          className="w-full rounded border border-edge bg-surface-deep px-2 py-1 text-xs text-primary placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      {showAiChat && (
        <>
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
            Quick Actions
          </div>
          <button
            type="button"
            onClick={onCreateAiChat}
            className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-primary transition-colors ${highlightIndex === 0 ? 'bg-surface-hover' : 'hover:bg-surface-hover'}`}
          >
            <FiMessageCircle className="h-3.5 w-3.5 text-muted" />
            <span className="flex-1">AI Chat</span>
            <kbd className="text-[10px] text-muted">1</kbd>
          </button>
        </>
      )}

      {filteredViews.length > 0 && (
        <>
          <div className="my-1 border-t border-edge" />
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
            Views
          </div>
          {filteredViews.map((type) => {
            const Icon = VIEW_ICONS[type] ?? FiMessageSquare;
            const itemIndex = menuItems.findIndex((m) => m.type === type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => onAddTab(type)}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-primary transition-colors ${highlightIndex === itemIndex ? 'bg-surface-hover' : 'hover:bg-surface-hover'}`}
              >
                <Icon className="h-3.5 w-3.5 text-muted" />
                <span className="flex-1">{TAB_LABELS[type]}</span>
                {itemIndex >= 0 && itemIndex < 9 && (
                  <kbd className="text-[10px] text-muted">{itemIndex + 1}</kbd>
                )}
              </button>
            );
          })}
        </>
      )}

      {!showAiChat && filteredViews.length === 0 && (
        <div className="px-3 py-2 text-xs text-muted">No matching tabs</div>
      )}
    </div>
  );
}
