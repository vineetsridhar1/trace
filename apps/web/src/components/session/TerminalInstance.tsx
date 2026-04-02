import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { TerminalSocket } from "../../lib/terminal-ws";
import { useTerminalStore } from "../../stores/terminal";

export function TerminalInstance({ terminalId, visible }: { terminalId: string; visible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const socketRef = useRef<TerminalSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const setTerminalStatus = useTerminalStore((s) => s.setTerminalStatus);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: {
        background: "#0a0a0a",
        foreground: "#e4e4e7",
        cursor: "#e4e4e7",
        selectionBackground: "#27272a",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // Fit after a brief delay so the container has been laid out
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    termRef.current = term;
    fitRef.current = fitAddon;

    // Connect WebSocket
    const socket = new TerminalSocket(terminalId);
    socketRef.current = socket;

    term.onData((data) => {
      socket.write(data);
    });

    socket.onEvent((event) => {
      switch (event.type) {
        case "ready": {
          setTerminalStatus(terminalId, "active");
          const pending = useTerminalStore.getState().consumePendingInput(terminalId);
          if (pending) {
            socket.write(pending);
          }
          break;
        }
        case "output":
          term.write(event.data);
          break;
        case "exit":
          setTerminalStatus(terminalId, "exited");
          term.write("\r\n\x1b[90m[Process exited]\x1b[0m\r\n");
          break;
        case "error":
          setTerminalStatus(terminalId, "exited");
          term.write(`\r\n\x1b[31m[Error: ${event.message}]\x1b[0m\r\n`);
          break;
        case "reconnecting":
          term.write("\r\n\x1b[33m[Reconnecting...]\x1b[0m\r\n");
          break;
        case "reconnected":
          setTerminalStatus(terminalId, "active");
          break;
        case "disconnected":
          setTerminalStatus(terminalId, "exited");
          term.write("\r\n\x1b[33m[Connection lost]\x1b[0m\r\n");
          break;
      }
    });

    socket.connect();

    // Handle resize (debounced to avoid flooding bridge during drag)
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (!visibleRef.current) return;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        fitAddon.fit();
        socket.resize(term.cols, term.rows);
      }, 100);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      socket.close();
      term.dispose();
      termRef.current = null;
      socketRef.current = null;
      fitRef.current = null;
    };
  }, [terminalId, setTerminalStatus]);

  // Refit when tab becomes visible (xterm can't measure while hidden)
  useEffect(() => {
    if (visible && fitRef.current && termRef.current && socketRef.current) {
      requestAnimationFrame(() => {
        fitRef.current?.fit();
        if (termRef.current && socketRef.current) {
          socketRef.current.resize(termRef.current.cols, termRef.current.rows);
        }
        termRef.current?.focus();
      });
    }
  }, [visible]);

  return <div ref={containerRef} className="h-full w-full" />;
}
