import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { ThemeName } from "../stores/themeStore";
import { useThemeStore } from "../stores/themeStore";

export const DEFAULT_TERMINAL_FONT_FAMILY =
  '"MesloLGS NF", "Hack Nerd Font Mono", "JetBrainsMono Nerd Font Mono", "FiraCode Nerd Font Mono", Menlo, Monaco, "Courier New", monospace';

const TERMINAL_THEMES: Record<ThemeName, Record<string, string>> = {
  neutral: {
    background: "#171717",
    foreground: "#a1a1aa",
    cursor: "#a1a1aa",
    selectionBackground: "#3f3f46",
    black: "#0a0a0a",
    red: "#ef4444",
    green: "#22c55e",
    yellow: "#eab308",
    blue: "#3b82f6",
    magenta: "#a855f7",
    cyan: "#06b6d4",
    white: "#a1a1aa",
    brightBlack: "#52525b",
    brightRed: "#f87171",
    brightGreen: "#4ade80",
    brightYellow: "#facc15",
    brightBlue: "#60a5fa",
    brightMagenta: "#c084fc",
    brightCyan: "#22d3ee",
    brightWhite: "#d4d4d8",
  },
  tokyonight: {
    background: "#1a1b26",
    foreground: "#c0caf5",
    cursor: "#c0caf5",
    selectionBackground: "#33467c",
    black: "#16161e",
    red: "#f7768e",
    green: "#9ece6a",
    yellow: "#e0af68",
    blue: "#7aa2f7",
    magenta: "#bb9af7",
    cyan: "#7dcfff",
    white: "#a9b1d6",
    brightBlack: "#565f89",
    brightRed: "#f7768e",
    brightGreen: "#9ece6a",
    brightYellow: "#e0af68",
    brightBlue: "#7aa2f7",
    brightMagenta: "#bb9af7",
    brightCyan: "#7dcfff",
    brightWhite: "#c0caf5",
  },
};

interface UseTerminalOptions {
  terminalId: string;
  cwd: string;
  env?: Record<string, string>;
  command?: string;
  readOnly?: boolean;
  fontFamily?: string;
  initialContent?: string;
}

export function useTerminal({
  terminalId,
  cwd,
  env,
  command,
  readOnly,
  fontFamily,
  initialContent,
}: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Store env/command/readOnly/fontFamily in refs so the effect doesn't re-fire when
  // the env object reference changes across renders.  These values only
  // meaningfully change alongside a new terminalId (which triggers a fresh
  // component mount via React key), so reading them from refs is safe.
  const envRef = useRef(env);
  const commandRef = useRef(command);
  const readOnlyRef = useRef(readOnly);
  const fontFamilyRef = useRef(fontFamily);
  const initialContentRef = useRef(initialContent);
  envRef.current = env;
  commandRef.current = command;
  readOnlyRef.current = readOnly;
  fontFamilyRef.current = fontFamily;
  initialContentRef.current = initialContent;

  const focusInput = useCallback(() => {
    const term = terminalRef.current;
    if (!term) return;
    term.focus();
    const textarea =
      term.textarea ??
      (containerRef.current?.querySelector(
        ".xterm-helper-textarea",
      ) as HTMLTextAreaElement | null);
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

    // Snapshot values from refs at effect start
    const currentEnv = envRef.current;
    const currentCommand = commandRef.current;
    const currentReadOnly = readOnlyRef.current;
    const currentFontFamily = fontFamilyRef.current;
    const currentInitialContent = initialContentRef.current;

    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    let initializing = false;
    // Guard: set to true when the effect cleans up so that the async init()
    // stops doing work (creating PTYs, registering listeners, etc.).
    let disposed = false;
    let inputDisposable: { dispose: () => void } | null = null;
    let resizeDisposable: { dispose: () => void } | null = null;
    let cleanupData: (() => void) | null = null;
    let cleanupExit: (() => void) | null = null;
    let cleanupCmdReady: (() => void) | null = null;
    const focusTimers: ReturnType<typeof setTimeout>[] = [];
    const miscTimers: ReturnType<typeof setTimeout>[] = [];

    // Subscribe to theme changes and update terminal colors live
    const unsubTheme = useThemeStore.subscribe((state) => {
      if (terminal) {
        terminal.options.theme = TERMINAL_THEMES[state.theme];
      }
    });

    const init = async () => {
      if (terminal || initializing) return;
      initializing = true;

      terminal = new Terminal({
        theme: TERMINAL_THEMES[useThemeStore.getState().theme],
        fontFamily: currentFontFamily || DEFAULT_TERMINAL_FONT_FAMILY,
        fontSize: 13,
        cursorBlink: !currentReadOnly && !currentInitialContent,
        disableStdin: currentReadOnly || !!currentInitialContent,
        convertEol: true,
      });
      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      // Clear any leftover DOM from a previous terminal (e.g. React StrictMode remount)
      container.replaceChildren();
      terminal.open(container);

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      // Static content mode: write content and skip PTY entirely
      if (currentInitialContent) {
        terminal.write(currentInitialContent);
        const t = setTimeout(() => fitAddon?.fit(), 50);
        miscTimers.push(t);
        return;
      }

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

      // Check if the PTY already exists (reconnect after navigation)
      let ptyExists = false;
      try {
        const hasResult = await window.traceAPI.hasPty(terminalId);
        ptyExists = hasResult.success && hasResult.exists;
      } catch {
        // Assume no existing PTY
      }

      // Bail out if the effect was cleaned up while we were awaiting
      if (disposed) return;

      if (ptyExists) {
        // Reconnect: fetch scrollback from main process and replay it.
        // Buffer any live PTY data that arrives during the async fetch so
        // nothing is lost.
        const pendingData: string[] = [];
        cleanupData = window.traceAPI.onPtyData((id, data) => {
          if (id === terminalId) pendingData.push(data);
        });

        const scrollbackResult = await window.traceAPI.getPtyScrollback(terminalId);
        if (disposed) return;

        if (scrollbackResult.data) {
          terminal.write(scrollbackResult.data);
        }
        for (const chunk of pendingData) {
          terminal.write(chunk);
        }

        // Switch to direct writing for subsequent data
        cleanupData();
        cleanupData = null;
      } else {
        // Create a new PTY
        const result = await window.traceAPI.createPty(
          terminalId,
          cwd,
          currentEnv,
        );
        // Bail out if cleaned up during createPty
        if (disposed) return;
        if (!result.success) {
          terminal?.write(
            `\r\n[PTY start failed: ${result.error ?? "unknown error"}]\r\n`,
          );
        } else if (currentCommand) {
          // Wait for the shell to emit its first output (prompt) before
          // sending the startup command.  This avoids a fixed timeout that
          // can be too short when multiple PTYs start concurrently.
          let sent = false;
          cleanupCmdReady = window.traceAPI.onPtyData((id, _data) => {
            if (id === terminalId && !sent && !disposed) {
              sent = true;
              cleanupCmdReady?.();
              cleanupCmdReady = null;
              // Small delay after first output to let the prompt fully render
              const t = setTimeout(() => {
                if (!disposed) {
                  void window.traceAPI.writePty(
                    terminalId,
                    `${currentCommand}\n`,
                  );
                }
              }, 80);
              miscTimers.push(t);
            }
          });
          // Fallback: if we never get PTY data within 3s, send anyway
          const fallback = setTimeout(() => {
            if (!sent && !disposed) {
              sent = true;
              cleanupCmdReady?.();
              cleanupCmdReady = null;
              void window.traceAPI.writePty(terminalId, `${currentCommand}\n`);
            }
          }, 3000);
          miscTimers.push(fallback);
        }
      }

      if (!currentReadOnly) {
        inputDisposable = terminal.onData((data) => {
          void window.traceAPI.writePty(terminalId, data);
        });
      }

      cleanupData = window.traceAPI.onPtyData((id, data) => {
        if (id === terminalId) terminal?.write(data);
      });

      cleanupExit = window.traceAPI.onPtyExit((id) => {
        if (id === terminalId) terminal?.write("\r\n[Process exited]\r\n");
      });

      resizeDisposable = terminal.onResize(({ cols, rows }) => {
        void window.traceAPI.resizePty(terminalId, cols, rows);
      });

      // Trigger a resize so the PTY gets the correct dimensions
      if (fitAddon) {
        const t = setTimeout(() => fitAddon?.fit(), 50);
        miscTimers.push(t);
      }
    };

    const handleWindowFocus = () => focusInput();
    window.addEventListener("focus", handleWindowFocus);

    // Wait for container to have dimensions before initializing xterm.
    // The container may start at zero size during CSS transitions.
    const observer = new ResizeObserver(() => {
      if (
        !terminal &&
        container.clientWidth > 0 &&
        container.clientHeight > 0
      ) {
        void init();
      } else if (
        fitAddon &&
        container.clientWidth > 0 &&
        container.clientHeight > 0
      ) {
        fitAddon.fit();
      }
    });
    observer.observe(container);

    if (container.clientWidth > 0 && container.clientHeight > 0) {
      void init();
    }

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("focus", handleWindowFocus);
      unsubTheme();
      for (const timer of focusTimers) clearTimeout(timer);
      for (const timer of miscTimers) clearTimeout(timer);
      inputDisposable?.dispose();
      resizeDisposable?.dispose();
      cleanupData?.();
      cleanupExit?.();
      cleanupCmdReady?.();
      terminal?.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
    // env/command/readOnly are read from refs — only terminalId and cwd
    // should trigger a full teardown/reinit of the PTY session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId, cwd, focusInput]);

  return { containerRef, fit, focus };
}
