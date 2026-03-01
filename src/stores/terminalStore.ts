import { create } from 'zustand';

export interface TerminalTab {
  terminalId: string;
  name: string;
  command?: string;
  env?: Record<string, string>;
  readOnly?: boolean;
}

export interface TerminalEntry {
  workspaceId: string;
  terminals: TerminalTab[];
  activeTabId: string | null;
  cwd: string;
}

interface WorkspaceTerminalState {
  terminals: TerminalTab[];
  activeTabId: string | null;
  cwd: string;
  env?: Record<string, string>;
}

export interface PtyProcessInfo {
  processName: string;
  isShellOnly: boolean;
}

interface TerminalState {
  // Current workspace projection
  terminals: TerminalTab[];
  activeTabId: string | null;
  cwd: string;
  initialized: boolean;
  allTerminalEntries: TerminalEntry[];
  runningPtyIds: Set<string>;
  ptyProcesses: Record<string, PtyProcessInfo>;
  workspacesWithRunningProcesses: Set<string>;

  // Internal backing store
  _allTerminals: Map<string, WorkspaceTerminalState>;
  _initializedWorkspaces: Set<string>;
  _currentWorkspaceId: string | null;
  _runCount: number;

  // Actions
  selectWorkspace: (workspaceId: string | null) => void;
  initializeDefaults: (workspaceId: string, worktreeCwd: string, env?: Record<string, string>) => void;
  setActiveTabId: (tabId: string) => void;
  rerunTab: (tabName: string, command: string, env?: Record<string, string>) => void;
  stopTab: (tabName: string) => void;
  killAllForWorkspace: (workspaceId: string) => void;
  killAll: () => void;
  killTerminal: (terminalId: string) => void;
  addTerminal: () => void;
  isInitialized: (workspaceId: string) => boolean;
  runAllScripts: (contextId: string, runCwd: string, scripts: { name: string; command: string }[], envMaps?: Record<string, string>[]) => void;
  detachAll: () => void;
  reattach: () => void;
  onPtyExit: (terminalId: string) => void;
  setPtyProcesses: (processes: Record<string, PtyProcessInfo>) => void;
  killIdleForWorkspace: (workspaceId: string) => Promise<void>;
}

function buildAllEntries(map: Map<string, WorkspaceTerminalState>): TerminalEntry[] {
  const entries: TerminalEntry[] = [];
  for (const [wsId, state] of map) {
    entries.push({ workspaceId: wsId, terminals: state.terminals, activeTabId: state.activeTabId, cwd: state.cwd });
  }
  return entries;
}

function buildWorkspacesWithRunning(
  map: Map<string, WorkspaceTerminalState>,
  runningIds: Set<string>,
  processes?: Record<string, PtyProcessInfo>,
): Set<string> {
  const result = new Set<string>();
  for (const [wsId, ws] of map) {
    for (const t of ws.terminals) {
      const processInfo = processes?.[t.terminalId];
      if (processInfo && !processInfo.isShellOnly) {
        result.add(wsId);
        break;
      }
      if (runningIds.has(t.terminalId)) {
        result.add(wsId);
        break;
      }
    }
  }
  return result;
}

function projectWorkspace(
  map: Map<string, WorkspaceTerminalState>,
  initializedSet: Set<string>,
  workspaceId: string | null,
): Partial<TerminalState> {
  if (!workspaceId) {
    return {
      terminals: [],
      activeTabId: null,
      cwd: '',
      initialized: false,
      allTerminalEntries: buildAllEntries(map),
    };
  }
  const entry = map.get(workspaceId);
  if (entry) {
    return {
      terminals: entry.terminals,
      activeTabId: entry.activeTabId,
      cwd: entry.cwd,
      initialized: initializedSet.has(workspaceId),
      allTerminalEntries: buildAllEntries(map),
    };
  }
  return {
    terminals: [],
    activeTabId: null,
    cwd: '',
    initialized: false,
    allTerminalEntries: buildAllEntries(map),
  };
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  terminals: [],
  activeTabId: null,
  cwd: '',
  initialized: false,
  allTerminalEntries: [],
  runningPtyIds: new Set(),
  ptyProcesses: {},
  workspacesWithRunningProcesses: new Set(),

  _allTerminals: new Map(),
  _initializedWorkspaces: new Set(),
  _currentWorkspaceId: null,
  _runCount: 0,

  selectWorkspace: (workspaceId) => {
    const state = get();
    state._currentWorkspaceId = workspaceId;
    set(projectWorkspace(state._allTerminals, state._initializedWorkspaces, workspaceId));
  },

  initializeDefaults: (workspaceId, worktreeCwd, env) => {
    const state = get();
    if (state._initializedWorkspaces.has(workspaceId)) return;
    state._initializedWorkspaces.add(workspaceId);

    state._runCount += 1;
    const run = state._runCount;

    const newTerminals: TerminalTab[] = [
      { terminalId: `setup-${workspaceId}-${run}`, name: 'Setup', readOnly: true },
      { terminalId: `run-${workspaceId}-${run}`, name: 'Run', readOnly: true },
      { terminalId: `shell-${workspaceId}-${run}`, name: 'Terminal 1', env },
    ];

    const entry: WorkspaceTerminalState = {
      terminals: newTerminals,
      activeTabId: newTerminals[2]?.terminalId ?? null,
      cwd: worktreeCwd,
      env,
    };
    state._allTerminals.set(workspaceId, entry);

    // Track terminals with commands as running
    const runningPtyIds = new Set(state.runningPtyIds);
    for (const t of newTerminals) {
      if (t.command) {
        runningPtyIds.add(t.terminalId);
      }
    }

    set({
      runningPtyIds,
      workspacesWithRunningProcesses: buildWorkspacesWithRunning(state._allTerminals, runningPtyIds, state.ptyProcesses),
      ...projectWorkspace(state._allTerminals, state._initializedWorkspaces, state._currentWorkspaceId),
    });
  },

  setActiveTabId: (tabId) => {
    const state = get();
    const wsId = state._currentWorkspaceId;
    if (wsId) {
      const entry = state._allTerminals.get(wsId);
      if (entry) {
        entry.activeTabId = tabId;
      }
    }
    set({ activeTabId: tabId, allTerminalEntries: buildAllEntries(state._allTerminals) });
  },

  rerunTab: (tabName, command, env) => {
    const state = get();
    const wsId = state._currentWorkspaceId;
    if (!wsId) return;
    const entry = state._allTerminals.get(wsId);
    if (!entry) return;

    const oldTab = entry.terminals.find((t) => t.name === tabName);
    if (oldTab) {
      void window.traceAPI.killPty(oldTab.terminalId);
      state.runningPtyIds.delete(oldTab.terminalId);
    }

    state._runCount += 1;
    const run = state._runCount;
    const newTerminalId = `${tabName.toLowerCase()}-${wsId}-${run}`;

    entry.terminals = entry.terminals.map((t) =>
      t.name === tabName
        ? { terminalId: newTerminalId, name: tabName, command, env, readOnly: t.readOnly }
        : t,
    );
    entry.activeTabId = newTerminalId;

    const runningPtyIds = new Set(state.runningPtyIds);
    runningPtyIds.add(newTerminalId);

    set({
      runningPtyIds,
      workspacesWithRunningProcesses: buildWorkspacesWithRunning(state._allTerminals, runningPtyIds, state.ptyProcesses),
      ...projectWorkspace(state._allTerminals, state._initializedWorkspaces, state._currentWorkspaceId),
    });
  },

  stopTab: (tabName) => {
    const state = get();
    const wsId = state._currentWorkspaceId;
    if (!wsId) return;
    const entry = state._allTerminals.get(wsId);
    if (!entry) return;

    const existing = entry.terminals.find((t) => t.name === tabName);
    if (!existing) return;

    void window.traceAPI.killPty(existing.terminalId);

    state._runCount += 1;
    const run = state._runCount;
    const newTerminalId = `${tabName.toLowerCase()}-${wsId}-${run}`;

    entry.terminals = entry.terminals.map((t) =>
      t.name === tabName
        ? { terminalId: newTerminalId, name: tabName, readOnly: t.readOnly }
        : t,
    );
    if (entry.activeTabId === existing.terminalId) {
      entry.activeTabId = newTerminalId;
    }

    const runningPtyIds = new Set(state.runningPtyIds);
    runningPtyIds.delete(existing.terminalId);

    set({
      runningPtyIds,
      workspacesWithRunningProcesses: buildWorkspacesWithRunning(state._allTerminals, runningPtyIds, state.ptyProcesses),
      ...projectWorkspace(state._allTerminals, state._initializedWorkspaces, state._currentWorkspaceId),
    });
  },

  killAllForWorkspace: (workspaceId) => {
    const state = get();
    const entry = state._allTerminals.get(workspaceId);
    const runningPtyIds = new Set(state.runningPtyIds);
    if (entry) {
      for (const t of entry.terminals) {
        void window.traceAPI.killPty(t.terminalId);
        runningPtyIds.delete(t.terminalId);
      }
    }
    state._allTerminals.delete(workspaceId);
    state._initializedWorkspaces.delete(workspaceId);

    set({
      runningPtyIds,
      workspacesWithRunningProcesses: buildWorkspacesWithRunning(state._allTerminals, runningPtyIds, state.ptyProcesses),
      ...projectWorkspace(state._allTerminals, state._initializedWorkspaces, state._currentWorkspaceId),
    });
  },

  killAll: () => {
    const state = get();
    const runningPtyIds = new Set(state.runningPtyIds);
    for (const [, ws] of state._allTerminals) {
      for (const t of ws.terminals) {
        void window.traceAPI.killPty(t.terminalId);
        runningPtyIds.delete(t.terminalId);
      }
    }
    state._allTerminals.clear();
    state._initializedWorkspaces.clear();
    state._currentWorkspaceId = null;

    set({
      terminals: [],
      activeTabId: null,
      cwd: '',
      initialized: false,
      allTerminalEntries: [],
      runningPtyIds,
      workspacesWithRunningProcesses: new Set(),
    });
  },

  killTerminal: (terminalId) => {
    void window.traceAPI.killPty(terminalId);
    const state = get();
    const runningPtyIds = new Set(state.runningPtyIds);
    runningPtyIds.delete(terminalId);

    const wsId = state._currentWorkspaceId;
    if (!wsId) {
      set({ runningPtyIds });
      return;
    }
    const entry = state._allTerminals.get(wsId);
    if (!entry) {
      set({ runningPtyIds });
      return;
    }

    entry.terminals = entry.terminals.filter((t) => t.terminalId !== terminalId);
    if (entry.terminals.length === 0) {
      state._allTerminals.delete(wsId);
      state._initializedWorkspaces.delete(wsId);
    } else if (entry.activeTabId === terminalId) {
      entry.activeTabId = entry.terminals[0].terminalId;
    }

    set({
      runningPtyIds,
      workspacesWithRunningProcesses: buildWorkspacesWithRunning(state._allTerminals, runningPtyIds, state.ptyProcesses),
      ...projectWorkspace(state._allTerminals, state._initializedWorkspaces, state._currentWorkspaceId),
    });
  },

  addTerminal: () => {
    const state = get();
    const wsId = state._currentWorkspaceId;
    if (!wsId) return;

    let entry = state._allTerminals.get(wsId);
    if (!entry) {
      entry = { terminals: [], activeTabId: null, cwd: '' };
      state._allTerminals.set(wsId, entry);
    }

    let maxN = 0;
    for (const t of entry.terminals) {
      const match = t.name.match(/^Terminal (\d+)$/);
      if (match) {
        maxN = Math.max(maxN, parseInt(match[1], 10));
      }
    }

    const tab: TerminalTab = {
      terminalId: `user-terminal-${wsId}-${maxN + 1}-${Date.now()}`,
      name: `Terminal ${maxN + 1}`,
      env: entry.env,
    };

    entry.terminals = [...entry.terminals, tab];
    entry.activeTabId = tab.terminalId;

    set(projectWorkspace(state._allTerminals, state._initializedWorkspaces, state._currentWorkspaceId));
  },

  isInitialized: (workspaceId) => get()._initializedWorkspaces.has(workspaceId),

  runAllScripts: (contextId, runCwd, scripts, envMaps) => {
    const state = get();
    if (state._allTerminals.has(contextId) && state._initializedWorkspaces.has(contextId)) {
      state._currentWorkspaceId = contextId;
      set(projectWorkspace(state._allTerminals, state._initializedWorkspaces, contextId));
      return;
    }

    state._runCount += 1;
    const run = state._runCount;

    const newTerminals: TerminalTab[] = scripts.map((script, i) => ({
      terminalId: `startup-${contextId}-${i}-${run}`,
      name: script.name,
      command: script.command,
      env: envMaps?.[i],
    }));

    const entry: WorkspaceTerminalState = {
      terminals: newTerminals,
      activeTabId: newTerminals[0]?.terminalId ?? null,
      cwd: runCwd,
    };

    state._allTerminals.set(contextId, entry);
    state._initializedWorkspaces.add(contextId);

    const runningPtyIds = new Set(state.runningPtyIds);
    for (const t of newTerminals) {
      if (t.command) {
        runningPtyIds.add(t.terminalId);
      }
    }

    state._currentWorkspaceId = contextId;
    set({
      runningPtyIds,
      workspacesWithRunningProcesses: buildWorkspacesWithRunning(state._allTerminals, runningPtyIds, state.ptyProcesses),
      ...projectWorkspace(state._allTerminals, state._initializedWorkspaces, contextId),
    });
  },

  detachAll: () => {
    const state = get();
    state._currentWorkspaceId = null;
    set({
      terminals: [],
      activeTabId: null,
      cwd: '',
      initialized: false,
      allTerminalEntries: [],
    });
  },

  reattach: () => {
    const state = get();
    set({ allTerminalEntries: buildAllEntries(state._allTerminals) });
  },

  onPtyExit: (terminalId) =>
    set((state) => {
      if (!state.runningPtyIds.has(terminalId)) return state;
      const next = new Set(state.runningPtyIds);
      next.delete(terminalId);
      return {
        runningPtyIds: next,
        workspacesWithRunningProcesses: buildWorkspacesWithRunning(state._allTerminals, next, state.ptyProcesses),
      };
    }),

  setPtyProcesses: (processes) => {
    set((state) => ({
      ptyProcesses: processes,
      workspacesWithRunningProcesses: buildWorkspacesWithRunning(state._allTerminals, state.runningPtyIds, processes),
    }));
  },

  killIdleForWorkspace: async (workspaceId) => {
    const state = useTerminalStore.getState();
    const entry = state._allTerminals.get(workspaceId);
    if (!entry) return;

    const terminalIds = entry.terminals.map((t) => t.terminalId);
    if (terminalIds.length === 0) return;

    try {
      const result = await window.traceAPI.getPtyProcesses(terminalIds);
      if (!result.success) return;
      const anyRunning = terminalIds.some((id) => {
        const info = result.processes[id];
        return info && !info.isShellOnly;
      });
      if (anyRunning) return;
    } catch {
      return;
    }

    // All terminals are idle — kill them all
    const current = useTerminalStore.getState();
    const runningPtyIds = new Set(current.runningPtyIds);
    for (const t of entry.terminals) {
      void window.traceAPI.killPty(t.terminalId);
      runningPtyIds.delete(t.terminalId);
    }
    current._allTerminals.delete(workspaceId);
    current._initializedWorkspaces.delete(workspaceId);

    useTerminalStore.setState({
      runningPtyIds,
      workspacesWithRunningProcesses: buildWorkspacesWithRunning(current._allTerminals, runningPtyIds, current.ptyProcesses),
      ...projectWorkspace(current._allTerminals, current._initializedWorkspaces, current._currentWorkspaceId),
    });
  },
}));

