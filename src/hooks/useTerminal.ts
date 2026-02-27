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
  env?: Record<string, string>;
  command?: string;
  readOnly?: boolean;
}

export function useTerminal({ terminalId, cwd, env, command, readOnly }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const focusInput = useCallback(() => {
    const term = terminalRef.current;
    if (!term) return;
    term.focus();
    const textarea =
      term.textarea ??
      (containerRef.current?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null);
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    if (document.activeElement !== textarea) {
      requestAnimationFrame(() => textarea.focus({ preventScroll: true }));
    }
  }, []);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  const focus = useCallback(() => {
    focusInput();
  }, [focusInput]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let inputDisposable: { dispose: () => void } | null = null;
    let resizeDisposable: { dispose: () => void } | null = null;
    let cleanupData: (() => void) | null = null;
    let cleanupExit: (() => void) | null = null;
    let cleanupCmdReady: (() => void) | null = null;
    const focusTimers: ReturnType<typeof setTimeout>[] = [];
    const miscTimers: ReturnType<typeof setTimeout>[] = [];

    const init = () => {
      if (terminal) return;

      terminal = new Terminal({
        theme: TOKYO_NIGHT_THEME,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 13,
        cursorBlink: !readOnly,
        disableStdin: readOnly,
        convertEol: true,
      });
      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      // Clear any leftover DOM from a previous terminal (e.g. React StrictMode remount)
      container.replaceChildren();
      terminal.open(container);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Retry focus through the panel transition; the first attempt can fail
      // while the fullscreen layout is still settling in Electron.
      const focusDelays = [380, 520, 700];
      for (const delay of focusDelays) {
        const timer = setTimeout(() => {
          fitAddon?.fit();
          focusInput();
        }, delay);
        focusTimers.push(timer);
      }

      void window.traceAPI.createPty(terminalId, cwd, env).then((result) => {
        if (!result.success) {
          terminal?.write(`\r\n[PTY start failed: ${result.error ?? 'unknown error'}]\r\n`);
        } else if (command) {
          // Wait for the shell to emit its first output (prompt) before
          // sending the startup command.  This avoids a fixed timeout that
          // can be too short when multiple PTYs start concurrently.
          let sent = false;
          cleanupCmdReady = window.traceAPI.onPtyData((id, _data) => {
            if (id === terminalId && !sent) {
              sent = true;
              cleanupCmdReady?.();
              cleanupCmdReady = null;
              // Small delay after first output to let the prompt fully render
              const t = setTimeout(() => {
                void window.traceAPI.writePty(terminalId, `${command}\n`);
              }, 80);
              miscTimers.push(t);
            }
          });
          // Fallback: if we never get PTY data within 3s, send anyway
          const fallback = setTimeout(() => {
            if (!sent) {
              sent = true;
              cleanupCmdReady?.();
              cleanupCmdReady = null;
              void window.traceAPI.writePty(terminalId, `${command}\n`);
            }
          }, 3000);
          miscTimers.push(fallback);
        }
      });

      if (!readOnly) {
        inputDisposable = terminal.onData((data) => {
          void window.traceAPI.writePty(terminalId, data);
        });
      }

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

    const handleWindowFocus = () => focusInput();
    window.addEventListener('focus', handleWindowFocus);

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
      window.removeEventListener('focus', handleWindowFocus);
      for (const timer of focusTimers) clearTimeout(timer);
      for (const timer of miscTimers) clearTimeout(timer);
      inputDisposable?.dispose();
      resizeDisposable?.dispose();
      cleanupData?.();
      cleanupExit?.();
      cleanupCmdReady?.();
      terminal?.dispose();
      void window.traceAPI.killPty(terminalId);
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalId, cwd, env, command, focusInput]);

  return { containerRef, fit, focus };
}
