import { useEffect, useRef } from 'react';
import { useHotkey } from './useHotkey';
import { useAppUIStore } from '../stores/appUIStore';
import { useTerminalStore } from '../stores/terminalStore';
import { useThreadStore } from '../stores/threadStore';
import { useShortcutStore } from '../stores/shortcutStore';
import { useClaudeRunStore } from '../stores/claudeRunStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useCommandPaletteStore } from '../stores/commandPaletteStore';
import { usePanelLayoutStore } from '../stores/panelLayoutStore';
import { useAuth } from '../context/AuthContext';
import type { Channel, Workspace, TicketStatus } from '../types';
import { STATUS_GROUP_ORDER } from '../components/MessageItem';

/** Flatten workspaces in the same visual order as the workspace list. */
function flattenWorkspaces(workspaces: Workspace[], currentUserId?: string): Workspace[] {
  const buckets = new Map<TicketStatus, Workspace[]>();
  for (const ws of workspaces) {
    let status = (ws.status ?? 'pending') as TicketStatus;
    if (status === 'completed') status = 'in_progress';
    let bucket = buckets.get(status);
    if (!bucket) {
      bucket = [];
      buckets.set(status, bucket);
    }
    bucket.push(ws);
  }
  const result: Workspace[] = [];
  for (const status of STATUS_GROUP_ORDER) {
    const items = buckets.get(status);
    if (items) {
      if (currentUserId) {
        items.sort((a, b) => {
          const aOwn = a.userId === currentUserId ? 0 : 1;
          const bOwn = b.userId === currentUserId ? 0 : 1;
          return aOwn - bOwn;
        });
      }
      result.push(...items);
    }
  }
  return result;
}

interface DefaultShortcutsOptions {
  serverChannels: Channel[];
  handleSwitchChannel: (id: string) => void;
  handleOpenWorkspace: (workspace: Workspace) => void;
}

export function useDefaultShortcuts({
  serverChannels,
  handleSwitchChannel,
  handleOpenWorkspace,
}: DefaultShortcutsOptions): void {
  // Keep refs so dynamic shortcuts always see latest closures
  const channelsRef = useRef(serverChannels);
  channelsRef.current = serverChannels;
  const switchChannelRef = useRef(handleSwitchChannel);
  switchChannelRef.current = handleSwitchChannel;
  const openWorkspaceRef = useRef(handleOpenWorkspace);
  openWorkspaceRef.current = handleOpenWorkspace;
  const { user: authUser } = useAuth();
  const authUserRef = useRef(authUser);
  authUserRef.current = authUser;

  // ─── Thread Panel Tabs (Mod+1-5) ─────────────────────────────────
  useHotkey('tab.agent', 'mod+1', () => usePanelLayoutStore.getState().activateTab('agent'), {
    label: 'Agent tab',
    category: 'navigation',
    context: 'thread-open',
  });
  useHotkey('tab.ticket', 'mod+2', () => usePanelLayoutStore.getState().activateTab('ticket'), {
    label: 'Ticket tab',
    category: 'navigation',
    context: 'thread-open',
  });
  useHotkey('tab.files', 'mod+3', () => usePanelLayoutStore.getState().activateTab('files'), {
    label: 'Files tab',
    category: 'navigation',
    context: 'thread-open',
  });
  useHotkey('tab.terminal', 'mod+4', () => usePanelLayoutStore.getState().activateTab('terminal'), {
    label: 'Terminal tab',
    category: 'navigation',
    context: 'thread-open',
  });
  useHotkey('tab.browser', 'mod+5', () => usePanelLayoutStore.getState().activateTab('browser'), {
    label: 'Browser tab',
    category: 'navigation',
    context: 'thread-open',
  });

  // ─── Switch Projects (Mod+Shift+1-9) — registered via useEffect ──
  useEffect(() => {
    const store = useShortcutStore.getState();
    for (let i = 1; i <= 9; i++) {
      const idx = i;
      store.register({
        id: `nav.channel-${idx}`,
        keys: `mod+shift+${idx}`,
        label: `Switch to project ${idx}`,
        category: 'navigation',
        context: 'global',
        action: () => {
          const ch = channelsRef.current[idx - 1];
          if (ch) switchChannelRef.current(ch.id);
        },
      });
    }
    return () => {
      const s = useShortcutStore.getState();
      for (let i = 1; i <= 9; i++) s.unregister(`nav.channel-${i}`);
    };
  }, []);

  // ─── Select Workspace (1-9 when not in input) ────────────────────
  useEffect(() => {
    const store = useShortcutStore.getState();
    for (let i = 1; i <= 9; i++) {
      const idx = i;
      store.register({
        id: `workspace.select-${idx}`,
        keys: `${idx}`,
        label: `Open workspace ${idx}`,
        category: 'navigation',
        context: 'global',
        preventDefault: false,
        action: () => {
          const workspaces = useWorkspaceStore.getState().workspaces;
          const flat = flattenWorkspaces(workspaces, authUserRef.current?.id);
          const ws = flat[idx - 1];
          if (ws) openWorkspaceRef.current(ws);
        },
      });
    }
    return () => {
      const s = useShortcutStore.getState();
      for (let i = 1; i <= 9; i++) s.unregister(`workspace.select-${i}`);
    };
  }, []);

  // ─── Navigate Workspaces (Up/Down arrows) ─────────────────────────
  useEffect(() => {
    const store = useShortcutStore.getState();

    store.register({
      id: 'workspace.prev',
      keys: 'up',
      label: 'Previous workspace',
      category: 'navigation',
      context: 'global',
      action: () => {
        const workspaces = useWorkspaceStore.getState().workspaces;
        const flat = flattenWorkspaces(workspaces, authUserRef.current?.id);
        if (flat.length === 0) return;
        const selectedId = useThreadStore.getState().selectedWorkspaceId;
        const currentIdx = flat.findIndex((ws) => ws.id === selectedId);
        if (currentIdx > 0) {
          openWorkspaceRef.current(flat[currentIdx - 1]);
        }
      },
    });

    store.register({
      id: 'workspace.next',
      keys: 'down',
      label: 'Next workspace',
      category: 'navigation',
      context: 'global',
      action: () => {
        const workspaces = useWorkspaceStore.getState().workspaces;
        const flat = flattenWorkspaces(workspaces, authUserRef.current?.id);
        if (flat.length === 0) return;
        const selectedId = useThreadStore.getState().selectedWorkspaceId;
        const currentIdx = flat.findIndex((ws) => ws.id === selectedId);
        if (currentIdx < flat.length - 1) {
          openWorkspaceRef.current(flat[currentIdx + 1]);
        }
      },
    });

    return () => {
      const s = useShortcutStore.getState();
      s.unregister('workspace.prev');
      s.unregister('workspace.next');
    };
  }, []);

  // ─── Panels ──────────────────────────────────────────────────────
  useHotkey(
    'panels.toggle-sidebar',
    'mod+b',
    () => {
      const ui = useAppUIStore.getState();
      ui.setChannelWidth(ui.channelWidth > 0 ? 0 : 220);
    },
    { label: 'Toggle sidebar', category: 'panels', context: 'global' },
  );
  useHotkey(
    'panels.toggle-fullscreen',
    'mod+shift+f',
    () => {
      const ui = useAppUIStore.getState();
      if (ui.isFullscreen) {
        ui.setIsFullscreen(false);
        ui.setChannelWidth(ui.savedWidths.channel);
      } else {
        ui.setSavedWidths({ channel: ui.channelWidth, thread: 0 });
        ui.setChannelWidth(0);
        ui.setIsFullscreen(true);
      }
    },
    { label: 'Toggle fullscreen', category: 'panels', context: 'global' },
  );
  useHotkey(
    'panels.close-thread',
    'escape',
    () => useThreadStore.getState().closeThreadPanel(),
    { label: 'Close thread panel', category: 'panels', context: 'thread-open' },
  );

  // ─── Terminal ────────────────────────────────────────────────────
  useHotkey(
    'terminal.new-tab',
    'mod+t',
    () => useTerminalStore.getState().addTerminal(),
    { label: 'New terminal tab', category: 'terminal', context: 'global' },
  );

  // ─── Thread ──────────────────────────────────────────────────────
  useHotkey(
    'thread.focus-input',
    'mod+l',
    () => {
      const el = document.getElementById('thread-input');
      if (el) el.focus();
    },
    { label: 'Focus thread input', category: 'thread', context: 'thread-open' },
  );
  useHotkey(
    'thread.stop-claude',
    'mod+backspace',
    () => {
      void useClaudeRunStore.getState().workspaceActions.stopClaude();
    },
    { label: 'Stop Claude', category: 'thread', context: 'thread-open' },
  );

  // ─── Creation ────────────────────────────────────────────────────
  useHotkey(
    'creation.new-workspace',
    'mod+n',
    () => {
      void useClaudeRunStore.getState().workspaceActions.createWorkspace();
    },
    { label: 'New workspace', category: 'creation', context: 'global' },
  );

  // ─── General ─────────────────────────────────────────────────────
  useHotkey(
    'general.command-palette',
    'mod+k',
    () => {
      const store = useCommandPaletteStore.getState();
      store.isOpen ? store.close() : store.open();
    },
    { label: 'Command palette', category: 'general', context: 'global' },
  );
  useHotkey(
    'general.settings',
    'mod+,',
    () => {
      const channelId = localStorage.getItem('activeChannelId');
      if (channelId) useAppUIStore.getState().setSettingsChannelId(channelId);
    },
    { label: 'Open settings', category: 'general', context: 'global' },
  );
  useHotkey(
    'general.help',
    'mod+/',
    () => {
      const store = useShortcutStore.getState();
      store.setHelpDialogOpen(!store.helpDialogOpen);
    },
    { label: 'Show keyboard shortcuts', category: 'general', context: 'global' },
  );
  useHotkey(
    'general.close-modal',
    'escape',
    () => {
      const ui = useAppUIStore.getState();
      if (useCommandPaletteStore.getState().isOpen) {
        useCommandPaletteStore.getState().close();
      } else if (useShortcutStore.getState().helpDialogOpen) {
        useShortcutStore.getState().setHelpDialogOpen(false);
      } else if (ui.settingsChannelId) {
        ui.setSettingsChannelId(null);
      } else if (ui.joinChannelId) {
        ui.setJoinChannelId(null);
      } else if (ui.createChannelType) {
        ui.setCreateChannelType(null);
      } else if (ui.showCreateServer) {
        ui.setShowCreateServer(false);
      }
    },
    { label: 'Close modal', category: 'general', context: 'modal-open' },
  );
}
