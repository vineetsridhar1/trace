import { useEffect } from 'react';
import { useTerminalStore } from '../stores/terminalStore';

export function useTerminalInit() {
  useEffect(() => {
    const cleanup = window.traceAPI.onPtyExit((terminalId: string) => {
      useTerminalStore.getState().onPtyExit(terminalId);
    });
    return cleanup;
  }, []);
}
