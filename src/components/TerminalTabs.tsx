import { FiPlay, FiRefreshCw, FiSettings, FiSquare, FiX } from 'react-icons/fi';
import { useTerminal } from '../hooks/useTerminal';
import { Tooltip } from './Tooltip';
import type { TerminalTab } from '../hooks/useStartupTerminals';
import '@xterm/xterm/css/xterm.css';

interface TerminalTabContentProps {
  terminalId: string;
  cwd: string;
  command?: string;
  visible: boolean;
  env?: Record<string, string>;
  readOnly?: boolean;
}

function TerminalTabContent({ terminalId, cwd, command, visible, env, readOnly }: TerminalTabContentProps) {
  const { containerRef, focus } = useTerminal({ terminalId, cwd, env, command, readOnly });

  return (
    <div
      className="absolute inset-0 pl-2 bg-[#1a1b26]"
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
  runScriptRunning: boolean;
  scriptsAvailable: boolean;
  hasSetupScript: boolean;
  hasRunScript: boolean;
  onSelectTab: (terminalId: string) => void;
  onCloseTab: (terminalId: string) => void;
  onCloseAll: () => void;
  onAddTab: () => void;
  onRunScript: () => void;
  onStopScript: () => void;
  onRerunSetup: () => void;
  onOpenSettings: () => void;
}

export function TerminalTabs({ terminals, activeTabId, cwd, runScriptRunning, scriptsAvailable, hasSetupScript, hasRunScript, onSelectTab, onCloseTab, onCloseAll, onAddTab, onRunScript, onStopScript, onRerunSetup, onOpenSettings }: TerminalTabsProps) {
  const runTab = terminals.find((t) => t.name === 'Run');
  const setupTab = terminals.find((t) => t.name === 'Setup');
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
                {!t.readOnly && (
                  <Tooltip text="Close tab">
                    <button
                      type="button"
                      className="ml-0.5 shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-[#3b4261]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(t.terminalId);
                      }}
                    >
                      <FiX className="h-2 w-2" aria-hidden="true" />
                    </button>
                  </Tooltip>
                )}
              </div>
            );
          })}
          <Tooltip text="New terminal">
            <button
              type="button"
              onClick={onAddTab}
              className="shrink-0 rounded px-1.5 py-1 text-xs text-[#565f89] hover:bg-[#1f2335] hover:text-[#a9b1d6]"
            >
              +
            </button>
          </Tooltip>
        </div>
        <Tooltip text="Close all terminals">
          <button
            type="button"
            onClick={onCloseAll}
            className="shrink-0 rounded px-2 py-1 text-xs text-[#565f89] hover:bg-[#292e42] hover:text-[#f7768e]"
          >
            Close All
          </button>
        </Tooltip>
      </div>

      {/* Setup action bar — only when script is configured */}
      {hasSetupScript && activeTabId === setupTab?.terminalId && (
        <div className="flex items-center bg-[#1a1b26] px-2 pb-1 pt-2">
          <Tooltip text="Re-run setup">
            <button
              type="button"
              onClick={onRerunSetup}
              className="flex items-center gap-1.5 rounded border border-[#292e42] px-2 py-1 text-xs text-[#565f89] transition-colors hover:bg-[#292e42] hover:text-[#c0caf5]"
            >
              <FiRefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Re-run Setup</span>
            </button>
          </Tooltip>
        </div>
      )}

      {/* Run script action bar — only when script is configured */}
      {hasRunScript && activeTabId === runTab?.terminalId && (
        <div className="flex items-center bg-[#1a1b26] px-2 pb-1 pt-2">
          {runScriptRunning ? (
            <Tooltip text="Stop script">
              <button
                type="button"
                onClick={onStopScript}
                className="flex items-center gap-1.5 rounded border border-[#292e42] px-2 py-1 text-xs text-[#f7768e] transition-colors hover:bg-[#292e42] hover:text-red-300"
              >
                <FiSquare className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Stop</span>
              </button>
            </Tooltip>
          ) : (
            <Tooltip text="Run script">
              <button
                type="button"
                onClick={onRunScript}
                className="flex items-center gap-1.5 rounded border border-[#292e42] px-2 py-1 text-xs text-green-400 transition-colors hover:bg-[#292e42] hover:text-green-300"
              >
                <FiPlay className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Run</span>
              </button>
            </Tooltip>
          )}
        </div>
      )}

      {/* Terminal content */}
      <div className="relative min-h-0 flex-1">
        {/* Configure placeholders for unconfigured script tabs */}
        {!hasSetupScript && activeTabId === setupTab?.terminalId && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1b26]">
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-2.5 rounded-lg border border-[#292e42] px-5 py-3 text-sm text-[#565f89] transition-colors hover:bg-[#1f2335] hover:text-[#c0caf5] hover:border-[#3b4261]"
            >
              <FiSettings className="h-5 w-5" aria-hidden="true" />
              <span>Configure Setup Script</span>
            </button>
            <p className="mt-3 text-xs text-[#3b4261]">Runs automatically when a workspace is created</p>
          </div>
        )}
        {!hasRunScript && activeTabId === runTab?.terminalId && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1b26]">
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-2.5 rounded-lg border border-[#292e42] px-5 py-3 text-sm text-[#565f89] transition-colors hover:bg-[#1f2335] hover:text-[#c0caf5] hover:border-[#3b4261]"
            >
              <FiSettings className="h-5 w-5" aria-hidden="true" />
              <span>Configure Run Script</span>
            </button>
            <p className="mt-3 text-xs text-[#3b4261]">Runs when you click the play button</p>
          </div>
        )}

        {/* Actual terminal content — skip mounting for unconfigured script tabs */}
        {terminals.map((t) => {
          const isSetupUnconfigured = t.name === 'Setup' && !hasSetupScript;
          const isRunUnconfigured = t.name === 'Run' && !hasRunScript;
          if (isSetupUnconfigured || isRunUnconfigured) return null;
          return (
            <TerminalTabContent
              key={t.terminalId}
              terminalId={t.terminalId}
              cwd={cwd}
              command={t.command}
              visible={t.terminalId === activeTabId}
              env={t.env}
              readOnly={t.readOnly}
            />
          );
        })}
      </div>
    </div>
  );
}
