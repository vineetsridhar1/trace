import { useTerminal } from '../hooks/useTerminal';
import type { TerminalTab } from '../hooks/useStartupTerminals';
import '@xterm/xterm/css/xterm.css';

interface TerminalTabContentProps {
  terminalId: string;
  cwd: string;
  command?: string;
  visible: boolean;
  env?: Record<string, string>;
}

function TerminalTabContent({ terminalId, cwd, command, visible, env }: TerminalTabContentProps) {
  const { containerRef, focus } = useTerminal({ terminalId, cwd, env, command });

  return (
    <div
      className="absolute inset-0 p-1"
      style={{ visibility: visible ? 'visible' : 'hidden' }}
      onClick={focus}
      onMouseDown={focus}
    >
      <div ref={containerRef} className="h-full" tabIndex={-1} />
    </div>
  );
}

interface TerminalTabsProps {
  terminals: TerminalTab[];
  activeTabId: string | null;
  cwd: string;
  onSelectTab: (terminalId: string) => void;
  onCloseTab: (terminalId: string) => void;
  onCloseAll: () => void;
  onAddTab: () => void;
}

export function TerminalTabs({ terminals, activeTabId, cwd, onSelectTab, onCloseTab, onCloseAll, onAddTab }: TerminalTabsProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-[#292e42] bg-[#16161e] px-1">
        <div className="flex flex-1 items-center gap-0.5 overflow-x-auto py-1">
          {terminals.map((t) => {
            const isActive = t.terminalId === activeTabId;
            return (
              <div
                key={t.terminalId}
                className={`group flex items-center gap-1.5 rounded px-2.5 py-1 text-xs cursor-pointer ${
                  isActive ? 'bg-[#292e42] text-[#c0caf5]' : 'text-[#565f89] hover:bg-[#1f2335] hover:text-[#a9b1d6]'
                }`}
                onClick={() => onSelectTab(t.terminalId)}
              >
                <span className="truncate max-w-[120px]">{t.name}</span>
                <button
                  type="button"
                  className="ml-0.5 shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-[#3b4261]"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(t.terminalId);
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={onAddTab}
            className="shrink-0 rounded px-1.5 py-1 text-xs text-[#565f89] hover:bg-[#1f2335] hover:text-[#a9b1d6]"
            title="New terminal"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={onCloseAll}
          className="shrink-0 rounded px-2 py-1 text-xs text-[#565f89] hover:bg-[#292e42] hover:text-[#f7768e]"
          title="Close all terminals"
        >
          Close All
        </button>
      </div>

      {/* Terminal content -- all mounted, visibility toggled via CSS */}
      <div className="relative min-h-0 flex-1">
        {terminals.map((t) => (
          <TerminalTabContent
            key={t.terminalId}
            terminalId={t.terminalId}
            cwd={cwd}
            command={t.command}
            visible={t.terminalId === activeTabId}
            env={t.env}
          />
        ))}
      </div>
    </div>
  );
}
