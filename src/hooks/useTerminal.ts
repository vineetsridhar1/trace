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

  const focus = useCallback(() => {
    const term = terminalRef.current;
    if (!term) return;
    term.focus();
    // Fallback: directly focus the helper textarea xterm uses for keyboard input.
    // In some Electron/xterm.js configurations, terminal.focus() alone doesn't
    // reliably move DOM focus to the hidden textarea.
    const textarea = containerRef.current?.querySelector('textarea');
    if (textarea) textarea.focus();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let inputDisposable: { dispose: () => void } | null = null;
    let resizeDisposable: { dispose: () => void } | null = null;
    let cleanupData: (() => void) | null = null;
    let cleanupExit: (() => void) | null = null;

    const init = () => {
      if (terminal) return;

      terminal = new Terminal({
        theme: TOKYO_NIGHT_THEME,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 13,
        cursorBlink: true,
        convertEol: true,
      });
      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      // Clear any leftover DOM from a previous terminal (e.g. React StrictMode remount)
      container.replaceChildren();
      terminal.open(container);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Delay fit + focus until the CSS panel transition completes (350ms).
      // Using setTimeout instead of rAF because the transition duration
      // is longer than a couple of animation frames.
      setTimeout(() => {
        fitAddon?.fit();
        terminal?.focus();
        // Also directly focus the helper textarea as a fallback
        const textarea = container.querySelector('textarea');
        if (textarea) textarea.focus();
      }, 380);

      void window.traceAPI.createPty(terminalId, cwd);

      inputDisposable = terminal.onData((data) => {
        void window.traceAPI.writePty(terminalId, data);
      });

      cleanupData = window.traceAPI.onPtyData((id, data) => {
        if (id === terminalId) terminal?.write(data);
      });

      cleanupExit = window.traceAPI.onPtyExit((id) => {
        if (id === terminalId) terminal?.write('\r\n[Process exited]\r\n');
      });

      resizeDisposable = terminal.onResize(({ cols, rows }) => {
        void window.traceAPI.resizePty(terminalId, cols, rows);
      });
    };

    // Wait for container to have dimensions before initializing xterm.
    // The container may start at zero size during CSS transitions.
    const observer = new ResizeObserver(() => {
      if (!terminal && container.clientWidth > 0 && container.clientHeight > 0) {
        init();
      } else if (fitAddon) {
        fitAddon.fit();
      }
    });
    observer.observe(container);

    if (container.clientWidth > 0 && container.clientHeight > 0) {
      init();
    }

    return () => {
      observer.disconnect();
      inputDisposable?.dispose();
      resizeDisposable?.dispose();
      cleanupData?.();
      cleanupExit?.();
      terminal?.dispose();
      void window.traceAPI.killPty(terminalId);
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalId, cwd]);

  return { containerRef, fit, focus };
}
