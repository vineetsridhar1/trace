import { useEffect } from 'react';
import { useTerminalStore } from '../stores/terminalStore';

export function useTerminalInit() {
  useEffect(() => {
    const cleanup = window.traceAPI.onPtyExit((terminalId: string) => {
      useTerminalStore.getState().onPtyExit(terminalId);
    });
    return cleanup;
  }, []);

  // Poll foreground process info for all active terminals
  useEffect(() => {
    const poll = async () => {
      const allTerminals = useTerminalStore.getState()._allTerminals;
      const allIds: string[] = [];
      for (const [, state] of allTerminals) {
        for (const t of state.terminals) {
          allIds.push(t.terminalId);
        }
      }
      if (allIds.length === 0) {
        useTerminalStore.getState().setPtyProcesses({});
        return;
      }
      try {
        const result = await window.traceAPI.getPtyProcesses(allIds);
        if (result.success) {
          useTerminalStore.getState().setPtyProcesses(result.processes);
        }
      } catch {
        // ignore poll errors
      }
    };

    void poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, []);
}
