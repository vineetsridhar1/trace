import { useEffect } from 'react';
import { useThreadStore } from '../stores/threadStore';
import { useAppUIStore } from '../stores/appUIStore';
import { useShortcutStore } from '../stores/shortcutStore';
import type { ShortcutContext } from '../stores/shortcutStore';
import { useCommandPaletteStore } from '../stores/commandPaletteStore';

/**
 * Derives active shortcut contexts from existing store state.
 * Run once in AppContent alongside useShortcuts().
 */
export function useShortcutContextSync(): void {
  const threadWidth = useThreadStore((s) => s.threadWidth);
  const settingsChannelId = useAppUIStore((s) => s.settingsChannelId);
  const joinChannelId = useAppUIStore((s) => s.joinChannelId);
  const createChannelType = useAppUIStore((s) => s.createChannelType);
  const showCreateServer = useAppUIStore((s) => s.showCreateServer);
  const helpDialogOpen = useShortcutStore((s) => s.helpDialogOpen);
  const commandPaletteOpen = useCommandPaletteStore((s) => s.isOpen);

  useEffect(() => {
    const contexts = new Set<ShortcutContext>(['global']);

    if (threadWidth > 0) contexts.add('thread-open');

    const hasModal = !!(settingsChannelId || joinChannelId || createChannelType || showCreateServer || helpDialogOpen || commandPaletteOpen);
    if (hasModal) contexts.add('modal-open');

    // terminal-focused is set/cleared by Terminal component via focus/blur events
    const current = useShortcutStore.getState().activeContexts;
    if (current.has('terminal-focused')) contexts.add('terminal-focused');

    useShortcutStore.getState().setActiveContexts(contexts);
  }, [threadWidth, settingsChannelId, joinChannelId, createChannelType, showCreateServer, helpDialogOpen, commandPaletteOpen]);
}
