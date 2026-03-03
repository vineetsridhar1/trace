import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch } from 'react-icons/fi';
import { useCommandPaletteStore } from '../stores/commandPaletteStore';
import { useCommandPaletteItems } from '../hooks/useCommandPaletteItems';
import { Kbd } from './Kbd';
import type { Channel } from '../types';

interface CommandPaletteProps {
  serverChannels: Channel[];
  onSwitchChannel: (channelId: string) => void;
  onOpenThreadLink: (channelId: string, workspaceId: string) => void;
}

export function CommandPalette({ serverChannels, onSwitchChannel, onOpenThreadLink }: CommandPaletteProps) {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const query = useCommandPaletteStore((s) => s.query);
  const selectedIndex = useCommandPaletteStore((s) => s.selectedIndex);

  const { groups, flatItems } = useCommandPaletteItems({
    serverChannels,
    handleSwitchChannel: onSwitchChannel,
    handleOpenThreadLink: onOpenThreadLink,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input when palette opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const executeItem = useCallback((index: number) => {
    const item = flatItems[index];
    if (item) {
      item.action();
      useCommandPaletteStore.getState().close();
    }
  }, [flatItems]);

  const scrollSelectedIntoView = useCallback((index: number) => {
    const el = listRef.current?.querySelector(`[data-index="${index}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const store = useCommandPaletteStore.getState();

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          const next = flatItems.length === 0 ? 0 : (selectedIndex + 1) % flatItems.length;
          store.setSelectedIndex(next);
          scrollSelectedIntoView(next);
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prev = flatItems.length === 0 ? 0 : (selectedIndex - 1 + flatItems.length) % flatItems.length;
          store.setSelectedIndex(prev);
          scrollSelectedIntoView(prev);
          break;
        }
        case 'Enter': {
          e.preventDefault();
          executeItem(selectedIndex);
          break;
        }
        case 'Escape': {
          e.preventDefault();
          store.close();
          break;
        }
      }
    },
    [selectedIndex, flatItems, executeItem, scrollSelectedIntoView],
  );

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex justify-center bg-black/60"
          style={{ paddingTop: '15vh' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) useCommandPaletteStore.getState().close();
          }}
        >
          <motion.div
            className="flex h-fit max-h-[70vh] w-[520px] flex-col overflow-hidden rounded-lg border border-edge bg-surface shadow-xl"
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15 }}
            onKeyDown={handleKeyDown}
          >
            {/* Search input */}
            <div className="flex items-center gap-2 border-b border-edge px-4 py-3">
              <FiSearch className="h-4 w-4 shrink-0 text-muted" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => useCommandPaletteStore.getState().setQuery(e.target.value)}
                placeholder="Search projects, workspaces..."
                className="flex-1 bg-transparent text-sm text-primary outline-none placeholder:text-muted"
              />
            </div>

            {/* Results */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-2">
              {flatItems.length === 0 ? (
                <div className="px-2 py-8 text-center text-xs text-muted">
                  No results found
                </div>
              ) : (
                groups.map((group) => {
                  return (
                    <div key={group.category} className="mb-1">
                      <div className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                        {group.label}
                      </div>
                      {group.items.map((item) => {
                        const globalIndex = flatItems.indexOf(item);
                        const isSelected = globalIndex === selectedIndex;
                        return (
                          <button
                            key={item.id}
                            data-index={globalIndex}
                            className={`flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                              isSelected ? 'bg-accent/15 text-primary' : 'text-primary hover:bg-surface-elevated'
                            }`}
                            onMouseEnter={() => useCommandPaletteStore.getState().setSelectedIndex(globalIndex)}
                            onClick={() => executeItem(globalIndex)}
                          >
                            {item.avatarUrl ? (
                              <img src={item.avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full" />
                            ) : item.avatarFallback ? (
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-deep text-[11px] font-medium text-muted">
                                {item.avatarFallback}
                              </span>
                            ) : item.icon ? (
                              <span className="flex shrink-0 items-center text-muted">{item.icon}</span>
                            ) : null}
                            <span className="min-w-0 flex-1 truncate">{item.label}</span>
                            {item.channelName && (
                              <span className="shrink-0 rounded bg-surface-deep px-1.5 py-0.5 text-[11px] text-muted">
                                {item.channelName}
                              </span>
                            )}
                            {item.statusLabel && (
                              <span className={`shrink-0 text-[11px] ${item.statusColor ?? 'text-muted'}`}>
                                {item.statusLabel}
                              </span>
                            )}
                            {item.shortcut && <Kbd keys={item.shortcut} />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 border-t border-edge px-4 py-2 text-[11px] text-muted">
              <span><kbd className="font-medium">↑↓</kbd> Navigate</span>
              <span><kbd className="font-medium">↵</kbd> Select</span>
              <span><kbd className="font-medium">Esc</kbd> Close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
