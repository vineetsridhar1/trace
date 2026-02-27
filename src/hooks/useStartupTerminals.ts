import { useState, useCallback, useRef } from 'react';

export interface TerminalTab {
  terminalId: string;
  name: string;
  command?: string;
  env?: Record<string, string>;
  readOnly?: boolean;
}

interface MessageTerminalState {
  terminals: TerminalTab[];
  activeTabId: string | null;
  cwd: string;
}

export function useStartupTerminals() {
  // Per-message backing store (ref = source of truth)
  const allTerminalsRef = useRef<Map<string, MessageTerminalState>>(new Map());
  // Tracks which messageIds have been initialized (prevents double-init)
  const initializedRef = useRef<Set<string>>(new Set());
  // Which message is currently projected into React state
  const currentMessageIdRef = useRef<string | null>(null);
  // Counter for unique terminal IDs
  const runCountRef = useRef(0);

  // React state — projection of the current message's terminals
  const [terminals, setTerminals] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabIdState] = useState<string | null>(null);
  const [cwd, setCwd] = useState<string>('');
  const [initialized, setInitialized] = useState(false);

  // Reads from ref, writes to React state
  const syncToState = useCallback((messageId: string | null) => {
    if (!messageId) {
      setTerminals([]);
      setActiveTabIdState(null);
      setCwd('');
      setInitialized(false);
      return;
    }
    const entry = allTerminalsRef.current.get(messageId);
    if (entry) {
      setTerminals(entry.terminals);
      setActiveTabIdState(entry.activeTabId);
      setCwd(entry.cwd);
      setInitialized(initializedRef.current.has(messageId));
    } else {
      setTerminals([]);
      setActiveTabIdState(null);
      setCwd('');
      setInitialized(false);
    }
  }, []);

  // Switch to a different message's terminals
  const selectMessage = useCallback((messageId: string | null) => {
    currentMessageIdRef.current = messageId;
    syncToState(messageId);
  }, [syncToState]);

  // Wrapper that also writes to the ref
  const setActiveTabId = useCallback((tabId: string) => {
    const msgId = currentMessageIdRef.current;
    if (msgId) {
      const entry = allTerminalsRef.current.get(msgId);
      if (entry) {
        entry.activeTabId = tabId;
      }
    }
    setActiveTabIdState(tabId);
  }, []);

  // Create default tabs for a message (Setup if script, Run if script, Terminal 1 always)
  const initializeDefaults = useCallback((
    messageId: string,
    worktreeCwd: string,
    setupScript?: string,
    runScript?: string,
    env?: Record<string, string>,
  ) => {
    // Guard: don't re-initialize
    if (initializedRef.current.has(messageId)) return;
    initializedRef.current.add(messageId);

    runCountRef.current += 1;
    const run = runCountRef.current;
    const newTerminals: TerminalTab[] = [];

    if (setupScript?.trim()) {
      newTerminals.push({
        terminalId: `setup-${messageId}-${run}`,
        name: 'Setup',
        command: setupScript,
        env,
        readOnly: true,
      });
    }

    if (runScript?.trim()) {
      // Create the Run tab without a command — it only executes when
      // the user clicks the play button (rerunTab).
      newTerminals.push({
        terminalId: `run-${messageId}-${run}`,
        name: 'Run',
        readOnly: true,
      });
    }

    newTerminals.push({
      terminalId: `shell-${messageId}-${run}`,
      name: 'Terminal 1',
    });

    const entry: MessageTerminalState = {
      terminals: newTerminals,
      activeTabId: newTerminals[0]?.terminalId ?? null,
      cwd: worktreeCwd,
    };
    allTerminalsRef.current.set(messageId, entry);

    // Update React state if this is the current message
    if (currentMessageIdRef.current === messageId) {
      syncToState(messageId);
    }
  }, [syncToState]);

  // Replace a named tab with a new terminalId (unmounts old PTY, mounts new)
  const rerunTab = useCallback((tabName: string, command: string, env?: Record<string, string>) => {
    const msgId = currentMessageIdRef.current;
    if (!msgId) return;
    const entry = allTerminalsRef.current.get(msgId);
    if (!entry) return;

    runCountRef.current += 1;
    const run = runCountRef.current;
    const newTerminalId = `${tabName.toLowerCase()}-${msgId}-${run}`;

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

    if (currentMessageIdRef.current === msgId) {
      syncToState(msgId);
    }
  }, [syncToState]);

  // Stop a named tab: kill its PTY and replace with an idle shell (no command)
  const stopTab = useCallback((tabName: string) => {
    const msgId = currentMessageIdRef.current;
    if (!msgId) return;
    const entry = allTerminalsRef.current.get(msgId);
    if (!entry) return;

    const existing = entry.terminals.find((t) => t.name === tabName);
    if (!existing) return;

    // Kill the running PTY
    void window.traceAPI.killPty(existing.terminalId);

    // Replace with a new idle terminal (no command)
    runCountRef.current += 1;
    const run = runCountRef.current;
    const newTerminalId = `${tabName.toLowerCase()}-${msgId}-${run}`;

    entry.terminals = entry.terminals.map((t) =>
      t.name === tabName
        ? { terminalId: newTerminalId, name: tabName, readOnly: t.readOnly }
        : t,
    );
    if (entry.activeTabId === existing.terminalId) {
      entry.activeTabId = newTerminalId;
    }

    if (currentMessageIdRef.current === msgId) {
      syncToState(msgId);
    }
  }, [syncToState]);

  // Delete all terminals for a specific message
  const killAllForMessage = useCallback((messageId: string) => {
    allTerminalsRef.current.delete(messageId);
    initializedRef.current.delete(messageId);
    if (currentMessageIdRef.current === messageId) {
      syncToState(messageId);
    }
  }, [syncToState]);

  // Clear everything (channel switch)
  const killAll = useCallback(() => {
    allTerminalsRef.current.clear();
    initializedRef.current.clear();
    currentMessageIdRef.current = null;
    setTerminals([]);
    setActiveTabIdState(null);
    setCwd('');
    setInitialized(false);
  }, []);

  // Close a single terminal tab
  const killTerminal = useCallback((terminalId: string) => {
    const msgId = currentMessageIdRef.current;
    if (!msgId) return;
    const entry = allTerminalsRef.current.get(msgId);
    if (!entry) return;

    entry.terminals = entry.terminals.filter((t) => t.terminalId !== terminalId);
    if (entry.terminals.length === 0) {
      allTerminalsRef.current.delete(msgId);
      initializedRef.current.delete(msgId);
    } else if (entry.activeTabId === terminalId) {
      entry.activeTabId = entry.terminals[0].terminalId;
    }

    if (currentMessageIdRef.current === msgId) {
      syncToState(msgId);
    }
  }, [syncToState]);

  // Add a new user terminal tab
  const addTerminal = useCallback(() => {
    const msgId = currentMessageIdRef.current;
    if (!msgId) return;

    let entry = allTerminalsRef.current.get(msgId);
    if (!entry) {
      // Create an entry if none exists
      entry = { terminals: [], activeTabId: null, cwd: '' };
      allTerminalsRef.current.set(msgId, entry);
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
      terminalId: `user-terminal-${msgId}-${maxN + 1}-${Date.now()}`,
      name: `Terminal ${maxN + 1}`,
    };

    entry.terminals = [...entry.terminals, tab];
    entry.activeTabId = tab.terminalId;

    if (currentMessageIdRef.current === msgId) {
      syncToState(msgId);
    }
  }, [syncToState]);

  // Channel-level sidebar play button (stores under channelId key in the map)
  const runAllScripts = useCallback(
    (contextId: string, runCwd: string, scripts: { name: string; command: string }[], envMaps?: Record<string, string>[]) => {
      // If terminals already exist for this context, just show them
      if (allTerminalsRef.current.has(contextId) && initializedRef.current.has(contextId)) {
        currentMessageIdRef.current = contextId;
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

      const entry: MessageTerminalState = {
        terminals: newTerminals,
        activeTabId: newTerminals[0]?.terminalId ?? null,
        cwd: runCwd,
      };

      allTerminalsRef.current.set(contextId, entry);
      initializedRef.current.add(contextId);
      currentMessageIdRef.current = contextId;
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
    selectMessage,
    initializeDefaults,
    rerunTab,
    stopTab,
    killAllForMessage,
    killAll,
    killTerminal,
    addTerminal,
    runAllScripts,
  };
}
