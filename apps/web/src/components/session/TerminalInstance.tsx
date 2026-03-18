import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { TerminalSocket } from "../../lib/terminal-ws";
import { useTerminalStore } from "../../stores/terminal";

export function TerminalInstance({ terminalId }: { terminalId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const socketRef = useRef<TerminalSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
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
      convertEol: true,
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
        case "ready":
          setTerminalStatus(terminalId, "active");
          break;
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

  return <div ref={containerRef} className="h-full w-full" />;
}
