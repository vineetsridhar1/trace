import { useState, useCallback, useRef } from 'react';

export interface TerminalTab {
  terminalId: string;
  name: string;
  command?: string;
  env?: Record<string, string>;
}

export function useStartupTerminals() {
  const [terminals, setTerminals] = useState<TerminalTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [runCwd, setRunCwd] = useState<string>('');
  // Counter to generate unique terminal IDs across runs
  const runCountRef = useRef(0);
  const userTerminalCountRef = useRef(0);
  // Track which channel the current terminals belong to
  const activeChannelRef = useRef<string | null>(null);

  const killAllTerminals = useCallback(() => {
    // Clearing the list unmounts TerminalTabContent components,
    // which triggers useTerminal cleanup (killPty).
    setTerminals([]);
    setActiveTabId(null);
    setIsVisible(false);
    activeChannelRef.current = null;
  }, []);

  const killTerminal = useCallback((terminalId: string) => {
    // Removing from list unmounts the component, triggering PTY cleanup.
    setTerminals((prev) => {
      const remaining = prev.filter((t) => t.terminalId !== terminalId);
      if (remaining.length === 0) {
        setActiveTabId(null);
        setIsVisible(false);
        activeChannelRef.current = null;
      } else {
        setActiveTabId((currentTab) =>
          currentTab === terminalId ? remaining[0].terminalId : currentTab,
        );
      }
      return remaining;
    });
  }, []);

  const showTerminals = useCallback(() => {
    setIsVisible(true);
  }, []);

  const runAllScripts = useCallback(
    (contextId: string, cwd: string, scripts: { name: string; command: string }[], envMaps?: Record<string, string>[]) => {
      // If terminals already exist for this context, just show them
      if (activeChannelRef.current === contextId) {
        setIsVisible(true);
        return;
      }

      runCountRef.current += 1;
      const run = runCountRef.current;

      // Build new terminal list. Old terminals unmount, killing their PTYs.
      const newTerminals: TerminalTab[] = scripts.map((script, i) => ({
        terminalId: `startup-${contextId}-${i}-${run}`,
        name: script.name,
        command: script.command,
        env: envMaps?.[i],
      }));

      activeChannelRef.current = contextId;
      setRunCwd(cwd);
      setTerminals(newTerminals);
      setActiveTabId(newTerminals.length > 0 ? newTerminals[0].terminalId : null);
      setIsVisible(newTerminals.length > 0);
    },
    [],
  );

  const addTerminal = useCallback(() => {
    userTerminalCountRef.current += 1;
    const n = userTerminalCountRef.current;
    const tab: TerminalTab = {
      terminalId: `user-terminal-${n}-${Date.now()}`,
      name: `Terminal ${n}`,
    };
    setTerminals((prev) => [...prev, tab]);
    setActiveTabId(tab.terminalId);
    setIsVisible(true);
  }, []);

  return {
    terminals,
    activeTabId,
    setActiveTabId,
    isVisible,
    runCwd,
    showTerminals,
    runAllScripts,
    killAllTerminals,
    killTerminal,
    addTerminal,
  };
}
