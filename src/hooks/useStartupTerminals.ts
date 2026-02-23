import { useState, useCallback, useRef } from 'react';
import type { StartupScript } from '../types';

export interface StartupTerminal {
  terminalId: string;
  script: StartupScript;
  env?: Record<string, string>;
}

export function useStartupTerminals() {
  const [terminals, setTerminals] = useState<StartupTerminal[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [runCwd, setRunCwd] = useState<string>('');
  // Counter to generate unique terminal IDs across runs
  const runCountRef = useRef(0);

  const killAllTerminals = useCallback(() => {
    // Clearing the list unmounts TerminalTabContent components,
    // which triggers useTerminal cleanup (killPty).
    setTerminals([]);
    setActiveTabId(null);
    setIsVisible(false);
  }, []);

  const killTerminal = useCallback((terminalId: string) => {
    // Removing from list unmounts the component, triggering PTY cleanup.
    setTerminals((prev) => {
      const remaining = prev.filter((t) => t.terminalId !== terminalId);
      if (remaining.length === 0) {
        setActiveTabId(null);
        setIsVisible(false);
      } else {
        setActiveTabId((currentTab) =>
          currentTab === terminalId ? remaining[0].terminalId : currentTab,
        );
      }
      return remaining;
    });
  }, []);

  const runAllScripts = useCallback(
    (contextId: string, cwd: string, scripts: StartupScript[], envMaps?: Record<string, string>[]) => {
      runCountRef.current += 1;
      const run = runCountRef.current;

      // Build new terminal list. Old terminals unmount, killing their PTYs.
      const newTerminals: StartupTerminal[] = scripts.map((script, i) => ({
        terminalId: `startup-${contextId}-${script.id}-${run}`,
        script,
        env: envMaps?.[i],
      }));

      setRunCwd(cwd);
      setTerminals(newTerminals);
      setActiveTabId(newTerminals.length > 0 ? newTerminals[0].terminalId : null);
      setIsVisible(newTerminals.length > 0);
    },
    [],
  );

  return {
    terminals,
    activeTabId,
    setActiveTabId,
    isVisible,
    runCwd,
    runAllScripts,
    killAllTerminals,
    killTerminal,
  };
}
