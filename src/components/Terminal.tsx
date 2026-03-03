import { useCallback } from 'react';
import { useTerminal } from '../hooks/useTerminal';
import { useShortcutStore } from '../stores/shortcutStore';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  terminalId: string;
  cwd: string;
}

export function Terminal({ terminalId, cwd }: TerminalProps) {
  const { containerRef, focus } = useTerminal({ terminalId, cwd });

  const mapKeyToPtyData = (e: React.KeyboardEvent<HTMLDivElement>): string | null => {
    if (e.metaKey || e.altKey) return null;

    if (e.ctrlKey && e.key.length === 1) {
      const ch = e.key.toUpperCase();
      if (ch >= 'A' && ch <= 'Z') return String.fromCharCode(ch.charCodeAt(0) - 64);
      if (ch === ' ') return '\0';
      return null;
    }

    switch (e.key) {
      case 'Enter':
        return '\r';
      case 'Backspace':
        return '\x7f';
      case 'Tab':
        return '\t';
      case 'Escape':
        return '\x1b';
      case 'ArrowUp':
        return '\x1b[A';
      case 'ArrowDown':
        return '\x1b[B';
      case 'ArrowRight':
        return '\x1b[C';
      case 'ArrowLeft':
        return '\x1b[D';
      case 'Delete':
        return '\x1b[3~';
      case 'Home':
        return '\x1b[H';
      case 'End':
        return '\x1b[F';
      case 'PageUp':
        return '\x1b[5~';
      case 'PageDown':
        return '\x1b[6~';
      default:
        break;
    }

    return e.key.length === 1 ? e.key : null;
  };

  const focusTerminal = () => {
    focus();
    requestAnimationFrame(focus);
  };

  const handleTerminalFocus = useCallback(() => {
    focusTerminal();
    const store = useShortcutStore.getState();
    const next = new Set(store.activeContexts);
    next.add('terminal-focused');
    store.setActiveContexts(next);
  }, []);

  const handleTerminalBlur = useCallback(() => {
    const store = useShortcutStore.getState();
    const next = new Set(store.activeContexts);
    next.delete('terminal-focused');
    store.setActiveContexts(next);
  }, []);

  const handleFallbackKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const isXtermTextarea = Boolean(target?.classList?.contains('xterm-helper-textarea'));
    if (isXtermTextarea) return;

    const data = mapKeyToPtyData(e);
    if (!data) return;
    e.preventDefault();
    void window.traceAPI.writePty(terminalId, data);
  };

  const handleFallbackPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const isXtermTextarea = Boolean(target?.classList?.contains('xterm-helper-textarea'));
    if (isXtermTextarea) return;

    const text = e.clipboardData.getData('text');
    if (!text) return;
    e.preventDefault();
    void window.traceAPI.writePty(terminalId, text.replace(/\r?\n/g, '\r'));
  };

  return (
    <div
      className="flex h-full flex-col overflow-hidden outline-none"
      tabIndex={0}
      onFocus={handleTerminalFocus}
      onBlur={handleTerminalBlur}
      onClick={focusTerminal}
      onMouseDown={focusTerminal}
      onTouchStart={focusTerminal}
      onKeyDown={handleFallbackKeyDown}
      onPaste={handleFallbackPaste}
    >
      <div className="flex items-center border-b border-edge px-3 py-1.5">
        <h4 className="text-xs font-semibold text-muted">Terminal</h4>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 p-1" tabIndex={-1} />
    </div>
  );
}
