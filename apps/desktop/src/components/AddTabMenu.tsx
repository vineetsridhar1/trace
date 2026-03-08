import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  FiMessageSquare,
  FiCheckSquare,
  FiFolder,
  FiFileText,
  FiGitPullRequest,
  FiMessageCircle,
  FiTerminal,
  FiChevronRight,
  FiTrash2,
} from 'react-icons/fi';
import { TAB_LABELS, VIEW_TAB_TYPES, isViewTabAvailable } from '../stores/tabStore';
import type { GlobalTabType } from '../stores/tabStore';
import type { AiChat, ChannelType } from '../types';
import { useKeybindings, type KeyBinding } from '../hooks/useKeybindings';

interface AddTabMenuProps {
  anchorRect: DOMRect;
  triggerRef: RefObject<HTMLButtonElement | null>;
  openTabTypes: Set<GlobalTabType>;
  aiChats: AiChat[];
  activeAiChatId: string | null;
  channelType: ChannelType;
  workspacesEnabled: boolean;
  hasGithubUrl: boolean;
  hasRepoPath: boolean;
  onAddTab: (type: GlobalTabType) => void;
  onCreateAiChat: () => void;
  onSwitchAiChat: (id: string) => void;
  onDeleteAiChat: (id: string) => void;
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
  anchorRect,
  triggerRef,
  openTabTypes,
  aiChats,
  activeAiChatId,
  channelType,
  workspacesEnabled,
  hasGithubUrl,
  hasRepoPath,
  onAddTab,
  onCreateAiChat,
  onSwitchAiChat,
  onDeleteAiChat,
  onClose,
}: AddTabMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const aiChatButtonRef = useRef<HTMLButtonElement>(null);
  const closeSubmenuTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [aiChatHistoryOpen, setAiChatHistoryOpen] = useState(false);
  const [aiChatAnchorRect, setAiChatAnchorRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const clearCloseTimeout = () => {
      if (closeSubmenuTimeoutRef.current) {
        clearTimeout(closeSubmenuTimeoutRef.current);
        closeSubmenuTimeoutRef.current = null;
      }
    };

    const handler = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) {
        return;
      }
      if (menuRef.current?.contains(e.target as Node) || submenuRef.current?.contains(e.target as Node)) {
        return;
      }
      if (menuRef.current) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', handleEscape);
    return () => {
      clearCloseTimeout();
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, triggerRef]);

  const availableViews = VIEW_TAB_TYPES.filter(
    (type) =>
      isViewTabAvailable(type, channelType, workspacesEnabled, hasGithubUrl, hasRepoPath) &&
      !openTabTypes.has(type),
  );

  const filterLower = filter.toLowerCase();
  const filteredViews = filterLower
    ? availableViews.filter((type) => TAB_LABELS[type].toLowerCase().includes(filterLower))
    : availableViews;

  const filteredAiChats = useMemo(() => {
    const ordered = [...aiChats].sort((a, b) => {
      const aTime = Date.parse(a.updatedAt);
      const bTime = Date.parse(b.updatedAt);
      return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
    });

    if (!filterLower) return ordered;

    return ordered.filter((chat) => {
      const haystack = `${chat.title} ${chat.lastMessage ?? ''}`.toLowerCase();
      return haystack.includes(filterLower);
    });
  }, [aiChats, filterLower]);

  const showAiChat = !filterLower
    || TAB_LABELS['ai-chat'].toLowerCase().includes(filterLower)
    || filteredAiChats.length > 0;

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

  useEffect(() => {
    if (!showAiChat) {
      setAiChatHistoryOpen(false);
    }
  }, [showAiChat]);

  // Register escape + number + arrow key bindings via the keybinding stack
  const bindings = useMemo<KeyBinding[]>(() => {
    const result: KeyBinding[] = [
      { keys: 'escape', callback: onClose },
      {
        keys: 'down',
        callback: () => {
          if (menuItems.length === 0) return;
          setHighlightIndex((prev) => (prev + 1) % menuItems.length);
        },
      },
      {
        keys: 'up',
        callback: () => {
          if (menuItems.length === 0) return;
          setHighlightIndex((prev) => (prev <= 0 ? menuItems.length - 1 : prev - 1));
        },
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

  const width = 208;
  const viewportPadding = 8;
  const roomBelow = window.innerHeight - anchorRect.bottom;
  const roomAbove = anchorRect.top;
  const openAbove = roomBelow < 260 && roomAbove > roomBelow;
  const idealLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
  const left = Math.max(
    viewportPadding,
    Math.min(idealLeft, window.innerWidth - width - viewportPadding),
  );
  const maxHeight = Math.max(160, (openAbove ? roomAbove : roomBelow) - 12);
  const submenuWidth = 280;
  const openSubmenuToLeft = left + width + submenuWidth + viewportPadding > window.innerWidth;
  const submenuMaxHeight = Math.max(260, Math.min(window.innerHeight - 48, 520));

  const openAiChatHistory = () => {
    if (!showAiChat) return;
    if (closeSubmenuTimeoutRef.current) {
      clearTimeout(closeSubmenuTimeoutRef.current);
      closeSubmenuTimeoutRef.current = null;
    }
    if (aiChatButtonRef.current) {
      setAiChatAnchorRect(aiChatButtonRef.current.getBoundingClientRect());
    }
    setAiChatHistoryOpen(true);
  };

  const closeAiChatHistorySoon = () => {
    if (closeSubmenuTimeoutRef.current) clearTimeout(closeSubmenuTimeoutRef.current);
    closeSubmenuTimeoutRef.current = setTimeout(() => {
      setAiChatHistoryOpen(false);
      closeSubmenuTimeoutRef.current = null;
    }, 120);
  };

  return createPortal(
    <>
      <div
        ref={menuRef}
        className="fixed z-[100] overflow-hidden rounded-md border border-edge bg-surface-elevated shadow-lg"
        style={
          openAbove
            ? {
                bottom: window.innerHeight - anchorRect.top + 6,
                left,
                width,
                maxHeight,
              }
            : {
                top: anchorRect.bottom + 6,
                left,
                width,
                maxHeight,
              }
        }
      >
        <div className="px-2 pb-1 pt-2">
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter..."
            className="w-full rounded border border-edge bg-surface-deep px-2 py-1 text-xs text-primary placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>

        <div className="overflow-y-auto py-1">
          {showAiChat && (
            <>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">
                Quick Actions
              </div>
              <button
                ref={aiChatButtonRef}
                type="button"
                onClick={onCreateAiChat}
                onMouseEnter={openAiChatHistory}
                onMouseLeave={closeAiChatHistorySoon}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-primary transition-colors ${highlightIndex === 0 ? 'bg-surface-hover' : 'hover:bg-surface-hover'}`}
              >
                <FiMessageCircle className="h-3.5 w-3.5 text-muted" />
                <span className="flex-1">AI Chat</span>
                <FiChevronRight className="h-3.5 w-3.5 text-muted" />
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
      </div>

      {showAiChat && aiChatHistoryOpen && aiChatAnchorRect && (
        <div
          ref={submenuRef}
          className="fixed z-[101] overflow-hidden rounded-md border border-edge bg-surface-elevated shadow-lg"
          style={{
            top: Math.min(
              aiChatAnchorRect.top,
              window.innerHeight - submenuMaxHeight - 12,
            ),
            left: openSubmenuToLeft
              ? Math.max(viewportPadding, left - submenuWidth - 6)
              : Math.min(window.innerWidth - submenuWidth - viewportPadding, left + width + 6),
            width: submenuWidth,
            maxHeight: submenuMaxHeight,
          }}
          onMouseEnter={openAiChatHistory}
          onMouseLeave={closeAiChatHistorySoon}
        >
          <div className="border-b border-edge px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
              Chat History
            </div>
            <div className="mt-0.5 text-[11px] text-muted">
              Recent chats
            </div>
          </div>

          <div className="overflow-y-auto py-1" style={{ maxHeight: submenuMaxHeight - 48 }}>
            {filteredAiChats.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted">No historical chats</div>
            ) : (
              filteredAiChats.map((chat) => {
                const isActive = chat.id === activeAiChatId;
                return (
                  <div
                    key={chat.id}
                    className={`group relative w-full transition-colors ${
                      isActive ? 'bg-surface-hover' : 'hover:bg-surface-hover'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSwitchAiChat(chat.id)}
                      className="flex w-full cursor-pointer flex-col items-start gap-0.5 px-3 py-2 pr-10 text-left"
                    >
                      <span className={`w-full truncate text-xs font-medium ${isActive ? 'text-accent-light' : 'text-primary'}`}>
                        {chat.title || 'AI Chat'}
                      </span>
                      <span className="w-full truncate text-[11px] text-muted">
                        {chat.lastMessage || 'No messages yet'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteAiChat(chat.id);
                      }}
                      className="absolute right-2 top-2 rounded p-1 text-muted opacity-0 transition-opacity hover:bg-surface-deep hover:text-red-400 group-hover:opacity-100"
                      aria-label={`Delete ${chat.title || 'AI Chat'}`}
                    >
                      <FiTrash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
