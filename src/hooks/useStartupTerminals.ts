import { useState, useCallback, useRef } from 'react';

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

export function useStartupTerminals() {
  // Per-workspace backing store (ref = source of truth)
  const allTerminalsRef = useRef<Map<string, WorkspaceTerminalState>>(new Map());
  // Tracks which workspaceIds have been initialized (prevents double-init)
  const initializedRef = useRef<Set<string>>(new Set());
  // Which workspace is currently projected into React state
  const currentWorkspaceIdRef = useRef<string | null>(null);
  // Counter for unique terminal IDs
  const runCountRef = useRef(0);

  // React state — projection of the current workspace's terminals
  const [terminals, setTerminals] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabIdState] = useState<string | null>(null);
  const [cwd, setCwd] = useState<string>('');
  const [initialized, setInitialized] = useState(false);
  // All workspaces' terminal entries (for persistent rendering)
  const [allTerminalEntries, setAllTerminalEntries] = useState<TerminalEntry[]>([]);

  // Rebuild allTerminalEntries from the ref map
  const syncAllToState = useCallback(() => {
    const entries: TerminalEntry[] = [];
    for (const [wsId, state] of allTerminalsRef.current) {
      entries.push({ workspaceId: wsId, terminals: state.terminals, activeTabId: state.activeTabId, cwd: state.cwd });
    }
    setAllTerminalEntries(entries);
  }, []);

  // Reads from ref, writes to React state
  const syncToState = useCallback((workspaceId: string | null) => {
    if (!workspaceId) {
      setTerminals([]);
      setActiveTabIdState(null);
      setCwd('');
      setInitialized(false);
      syncAllToState();
      return;
    }
    const entry = allTerminalsRef.current.get(workspaceId);
    if (entry) {
      setTerminals(entry.terminals);
      setActiveTabIdState(entry.activeTabId);
      setCwd(entry.cwd);
      setInitialized(initializedRef.current.has(workspaceId));
    } else {
      setTerminals([]);
      setActiveTabIdState(null);
      setCwd('');
      setInitialized(false);
    }
    syncAllToState();
  }, [syncAllToState]);

  // Switch to a different workspace's terminals
  const selectWorkspace = useCallback((workspaceId: string | null) => {
    currentWorkspaceIdRef.current = workspaceId;
    syncToState(workspaceId);
  }, [syncToState]);

  // Wrapper that also writes to the ref
  const setActiveTabId = useCallback((tabId: string) => {
    const wsId = currentWorkspaceIdRef.current;
    if (wsId) {
      const entry = allTerminalsRef.current.get(wsId);
      if (entry) {
        entry.activeTabId = tabId;
      }
    }
    setActiveTabIdState(tabId);
    syncAllToState();
  }, [syncAllToState]);

  // Create default tabs for a workspace (Setup, Run, Terminal 1 — always created)
  const initializeDefaults = useCallback((
    workspaceId: string,
    worktreeCwd: string,
    env?: Record<string, string>,
  ) => {
    // Guard: don't re-initialize
    if (initializedRef.current.has(workspaceId)) return;
    initializedRef.current.add(workspaceId);

    runCountRef.current += 1;
    const run = runCountRef.current;
    const newTerminals: TerminalTab[] = [];

    // Always create Setup tab — user can manually trigger via "Run Setup" button
    newTerminals.push({
      terminalId: `setup-${workspaceId}-${run}`,
      name: 'Setup',
      readOnly: true,
    });

    // Always create Run tab — only executes when user clicks play button
    newTerminals.push({
      terminalId: `run-${workspaceId}-${run}`,
      name: 'Run',
      readOnly: true,
    });

    newTerminals.push({
      terminalId: `shell-${workspaceId}-${run}`,
      name: 'Terminal 1',
      env,
    });

    const entry: WorkspaceTerminalState = {
      terminals: newTerminals,
      activeTabId: newTerminals[2]?.terminalId ?? null,
      cwd: worktreeCwd,
      env,
    };
    allTerminalsRef.current.set(workspaceId, entry);

    // Update React state if this is the current workspace
    if (currentWorkspaceIdRef.current === workspaceId) {
      syncToState(workspaceId);
    } else {
      syncAllToState();
    }
  }, [syncToState, syncAllToState]);

  // Replace a named tab with a new terminalId (unmounts old PTY, mounts new)
  const rerunTab = useCallback((tabName: string, command: string, env?: Record<string, string>) => {
    const wsId = currentWorkspaceIdRef.current;
    if (!wsId) return;
    const entry = allTerminalsRef.current.get(wsId);
    if (!entry) return;

    runCountRef.current += 1;
    const run = runCountRef.current;
    const newTerminalId = `${tabName.toLowerCase()}-${wsId}-${run}`;

    entry.terminals = entry.terminals.map((t) =>
      t.name === tabName
        ? { terminalId: newTerminalId, name: tabName, command, env, readOnly: t.readOnly }
        : t,
    );
    // If the replaced tab was active, keep focus on it
    const wasActive = entry.activeTabId === entry.terminals.find(t => t.name === tabName)?.terminalId;
    if (wasActive || entry.activeTabId === null) {
      entry.activeTabId = newTerminalId;
    }
    // Always set active to the rerun tab
    entry.activeTabId = newTerminalId;

    if (currentWorkspaceIdRef.current === wsId) {
      syncToState(wsId);
    }
  }, [syncToState]);

  // Stop a named tab: kill its PTY and replace with an idle shell (no command)
  const stopTab = useCallback((tabName: string) => {
    const wsId = currentWorkspaceIdRef.current;
    if (!wsId) return;
    const entry = allTerminalsRef.current.get(wsId);
    if (!entry) return;

    const existing = entry.terminals.find((t) => t.name === tabName);
    if (!existing) return;

    // Kill the running PTY
    void window.traceAPI.killPty(existing.terminalId);

    // Replace with a new idle terminal (no command)
    runCountRef.current += 1;
    const run = runCountRef.current;
    const newTerminalId = `${tabName.toLowerCase()}-${wsId}-${run}`;

    entry.terminals = entry.terminals.map((t) =>
      t.name === tabName
        ? { terminalId: newTerminalId, name: tabName, readOnly: t.readOnly }
        : t,
    );
    if (entry.activeTabId === existing.terminalId) {
      entry.activeTabId = newTerminalId;
    }

    if (currentWorkspaceIdRef.current === wsId) {
      syncToState(wsId);
    }
  }, [syncToState]);

  // Delete all terminals for a specific workspace
  const killAllForWorkspace = useCallback((workspaceId: string) => {
    allTerminalsRef.current.delete(workspaceId);
    initializedRef.current.delete(workspaceId);
    if (currentWorkspaceIdRef.current === workspaceId) {
      syncToState(workspaceId);
    } else {
      syncAllToState();
    }
  }, [syncToState, syncAllToState]);

  // Clear everything (channel switch)
  const killAll = useCallback(() => {
    allTerminalsRef.current.clear();
    initializedRef.current.clear();
    currentWorkspaceIdRef.current = null;
    setTerminals([]);
    setActiveTabIdState(null);
    setCwd('');
    setInitialized(false);
    setAllTerminalEntries([]);
  }, []);

  // Close a single terminal tab
  const killTerminal = useCallback((terminalId: string) => {
    const wsId = currentWorkspaceIdRef.current;
    if (!wsId) return;
    const entry = allTerminalsRef.current.get(wsId);
    if (!entry) return;

    entry.terminals = entry.terminals.filter((t) => t.terminalId !== terminalId);
    if (entry.terminals.length === 0) {
      allTerminalsRef.current.delete(wsId);
      initializedRef.current.delete(wsId);
    } else if (entry.activeTabId === terminalId) {
      entry.activeTabId = entry.terminals[0].terminalId;
    }

    if (currentWorkspaceIdRef.current === wsId) {
      syncToState(wsId);
    }
  }, [syncToState]);

  // Add a new user terminal tab
  const addTerminal = useCallback(() => {
    const wsId = currentWorkspaceIdRef.current;
    if (!wsId) return;

    let entry = allTerminalsRef.current.get(wsId);
    if (!entry) {
      // Create an entry if none exists
      entry = { terminals: [], activeTabId: null, cwd: '' };
      allTerminalsRef.current.set(wsId, entry);
    }

    // Compute name: find highest existing "Terminal N" and add 1
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

    if (currentWorkspaceIdRef.current === wsId) {
      syncToState(wsId);
    }
  }, [syncToState]);

  // Check if a workspace has already been initialized (ref-based, no state race)
  const isInitialized = useCallback((workspaceId: string) => {
    return initializedRef.current.has(workspaceId);
  }, []);

  // Channel-level sidebar play button (stores under channelId key in the map)
  const runAllScripts = useCallback(
    (contextId: string, runCwd: string, scripts: { name: string; command: string }[], envMaps?: Record<string, string>[]) => {
      // If terminals already exist for this context, just show them
      if (allTerminalsRef.current.has(contextId) && initializedRef.current.has(contextId)) {
        currentWorkspaceIdRef.current = contextId;
        syncToState(contextId);
        return;
      }

      runCountRef.current += 1;
      const run = runCountRef.current;

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

      allTerminalsRef.current.set(contextId, entry);
      initializedRef.current.add(contextId);
      currentWorkspaceIdRef.current = contextId;
      syncToState(contextId);
    },
    [syncToState],
  );

  return {
    terminals,
    activeTabId,
    setActiveTabId,
    cwd,
    initialized,
    allTerminalEntries,
    selectWorkspace,
    initializeDefaults,
    isInitialized,
    rerunTab,
    stopTab,
    killAllForWorkspace,
    killAll,
    killTerminal,
    addTerminal,
    runAllScripts,
  };
}
