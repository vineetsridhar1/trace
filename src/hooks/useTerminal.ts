import { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

const TOKYO_NIGHT_THEME = {
  background: '#1a1b26',
  foreground: '#c0caf5',
  cursor: '#c0caf5',
  selectionBackground: '#33467c',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5',
};

interface UseTerminalOptions {
  terminalId: string;
  cwd: string;
}

export function useTerminal({ terminalId, cwd }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const terminal = new Terminal({
      theme: TOKYO_NIGHT_THEME,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Fit after a frame to ensure container is sized, then focus
    requestAnimationFrame(() => {
      fitAddon.fit();
      terminal.focus();
    });

    // Spawn PTY
    void window.traceAPI.createPty(terminalId, cwd);

    // Forward input to PTY
    const inputDisposable = terminal.onData((data) => {
      void window.traceAPI.writePty(terminalId, data);
    });

    // Receive PTY output
    const cleanupData = window.traceAPI.onPtyData((id, data) => {
      if (id === terminalId) terminal.write(data);
    });

    const cleanupExit = window.traceAPI.onPtyExit((id) => {
      if (id === terminalId) terminal.write('\r\n[Process exited]\r\n');
    });

    // Auto-resize
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      void window.traceAPI.resizePty(terminalId, cols, rows);
    });

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(container);

    return () => {
      observer.disconnect();
      inputDisposable.dispose();
      resizeDisposable.dispose();
      cleanupData();
      cleanupExit();
      terminal.dispose();
      void window.traceAPI.killPty(terminalId);
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalId, cwd]);

  return { containerRef, fit };
}
