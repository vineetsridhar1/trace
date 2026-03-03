import { useState, useEffect } from "react";
import { FiPlay, FiRefreshCw, FiSettings, FiSquare, FiX } from "react-icons/fi";
import { useTerminal } from "../hooks/useTerminal";
import { Tooltip } from "./Tooltip";
import type { TerminalTab, TerminalEntry } from "../stores/terminalStore";
import "@xterm/xterm/css/xterm.css";

interface TerminalTabContentProps {
  terminalId: string;
  cwd: string;
  command?: string;
  visible: boolean;
  env?: Record<string, string>;
  readOnly?: boolean;
  fontFamily?: string;
  initialContent?: string;
}

function TerminalTabContent({
  terminalId,
  cwd,
  command,
  visible,
  env,
  readOnly,
  fontFamily,
  initialContent,
}: TerminalTabContentProps) {
  const { containerRef, focus } = useTerminal({
    terminalId,
    cwd,
    env,
    command,
    readOnly,
    fontFamily,
    initialContent,
  });

  return (
    <div
      className="absolute inset-0 pl-2 bg-surface"
      style={{ visibility: visible ? "visible" : "hidden" }}
      onClick={focus}
      onMouseDown={focus}
    >
      <div ref={containerRef} className="h-full" tabIndex={-1} />
    </div>
  );
}

interface TerminalTabsProps {
  terminals: TerminalTab[];
  allTerminalEntries: TerminalEntry[];
  currentWorkspaceId: string | null;
  activeTabId: string | null;
  cwd: string;
  runScriptRunning: boolean;
  scriptsAvailable: boolean;
  hasSetupScript: boolean;
  hasRunScript: boolean;
  setupOutput?: string;
  ptyProcesses: Record<string, { processName: string; isShellOnly: boolean }>;
  onSelectTab: (terminalId: string) => void;
  onCloseTab: (terminalId: string) => void;
  onCloseAll: () => void;
  onAddTab: () => void;
  onRunScript: () => void;
  onStopScript: () => void;
  onRerunSetup: () => void;
  onOpenSettings: () => void;
}

export function TerminalTabs({
  terminals,
  allTerminalEntries,
  currentWorkspaceId,
  activeTabId,
  cwd,
  runScriptRunning,
  scriptsAvailable,
  hasSetupScript,
  hasRunScript,
  setupOutput,
  ptyProcesses,
  onSelectTab,
  onCloseTab,
  onCloseAll,
  onAddTab,
  onRunScript,
  onStopScript,
  onRerunSetup,
  onOpenSettings,
}: TerminalTabsProps) {
  const [terminalFontFamily, setTerminalFontFamily] = useState<
    string | undefined
  >();
  useEffect(() => {
    window.traceAPI
      .getGlobalConfig()
      .then((cfg) => {
        setTerminalFontFamily(cfg.terminalFontFamily);
      })
      .catch((): void => {});
  }, []);

  const runTab = terminals.find((t) => t.name === "Run");
  const setupTab = terminals.find((t) => t.name === "Setup");
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar — current message only */}
      <div className="flex items-center border-b border-edge bg-surface-deep px-1">
        <div className="flex flex-1 items-center gap-0.5 overflow-x-auto py-1">
          {terminals.map((t) => {
            const isActive = t.terminalId === activeTabId;
            const processInfo = ptyProcesses[t.terminalId];
            const hasRunningProcess = processInfo && !processInfo.isShellOnly;
            return (
              <div
                key={t.terminalId}
                className={`group flex items-center gap-1.5 rounded px-2.5 py-1 text-xs cursor-pointer ${
                  isActive
                    ? "bg-surface-elevated text-primary"
                    : "text-muted hover:bg-surface-elevated hover:text-primary"
                }`}
                onClick={() => onSelectTab(t.terminalId)}
              >
                <span className="truncate max-w-[120px]">{t.name}</span>
                {hasRunningProcess && (
                  <span className="flex items-center gap-1 text-[10px] text-green-400 font-mono">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                    {processInfo.processName}
                  </span>
                )}
                {!t.readOnly && (
                  <Tooltip text="Close tab">
                    <button
                      type="button"
                      className="ml-0.5 shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-surface-hover"
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
              className="shrink-0 rounded px-1.5 py-1 text-xs text-muted hover:bg-surface-elevated hover:text-primary"
            >
              +
            </button>
          </Tooltip>
        </div>
        <Tooltip text="Close all terminals">
          <button
            type="button"
            onClick={onCloseAll}
            className="shrink-0 rounded px-2 py-1 text-xs text-muted hover:bg-surface-elevated hover:text-red-400"
          >
            Close All
          </button>
        </Tooltip>
      </div>

      {/* Setup action bar — when setup has been run (command exists) or has captured output */}
      {hasSetupScript &&
        (setupTab?.command || setupOutput) &&
        activeTabId === setupTab?.terminalId && (
          <div className="flex items-center bg-surface px-2 pb-1 pt-2">
            <Tooltip text="Re-run setup">
              <button
                type="button"
                onClick={onRerunSetup}
                className="flex items-center gap-1.5 rounded border border-edge px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-elevated hover:text-primary"
              >
                <FiRefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Re-run Setup</span>
              </button>
            </Tooltip>
          </div>
        )}

      {/* Run script action bar — only when script has been executed (has command) */}
      {hasRunScript &&
        runTab?.command &&
        activeTabId === runTab?.terminalId && (
          <div className="flex items-center bg-surface px-2 pb-1 pt-2">
            {runScriptRunning ? (
              <Tooltip text="Stop script">
                <button
                  type="button"
                  onClick={onStopScript}
                  className="flex items-center gap-1.5 rounded border border-edge px-2 py-1 text-xs text-red-400 transition-colors hover:bg-surface-elevated hover:text-red-300"
                >
                  <FiSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Stop</span>
                </button>
              </Tooltip>
            ) : (
              <Tooltip text="Re-run script">
                <button
                  type="button"
                  onClick={onRunScript}
                  className="flex items-center gap-1.5 rounded border border-edge px-2 py-1 text-xs text-green-400 transition-colors hover:bg-surface-elevated hover:text-green-300"
                >
                  <FiRefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Re-run</span>
                </button>
              </Tooltip>
            )}
          </div>
        )}

      {/* Terminal content */}
      <div className="relative min-h-0 flex-1">
        {/* Configure placeholders for unconfigured script tabs — current message only */}
        {hasSetupScript &&
          !setupTab?.command &&
          !setupOutput &&
          activeTabId === setupTab?.terminalId && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface">
              <button
                type="button"
                onClick={onRerunSetup}
                className="flex items-center gap-2.5 rounded-lg border border-edge px-5 py-3 text-sm text-muted transition-colors hover:bg-surface-elevated hover:text-primary hover:border-edge-hover"
              >
                <FiPlay className="h-5 w-5" aria-hidden="true" />
                <span>Run Setup</span>
              </button>
              <p className="mt-3 text-xs text-[#404040]">
                Setup has already run during workspace creation
              </p>
            </div>
          )}
        {!hasSetupScript && activeTabId === setupTab?.terminalId && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface">
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-2.5 rounded-lg border border-edge px-5 py-3 text-sm text-muted transition-colors hover:bg-surface-elevated hover:text-primary hover:border-edge-hover"
            >
              <FiSettings className="h-5 w-5" aria-hidden="true" />
              <span>Configure Setup Script</span>
            </button>
            <p className="mt-3 text-xs text-[#404040]">
              Runs automatically when a workspace is created
            </p>
          </div>
        )}
        {!hasRunScript && activeTabId === runTab?.terminalId && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface">
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center gap-2.5 rounded-lg border border-edge px-5 py-3 text-sm text-muted transition-colors hover:bg-surface-elevated hover:text-primary hover:border-edge-hover"
            >
              <FiSettings className="h-5 w-5" aria-hidden="true" />
              <span>Configure Run Script</span>
            </button>
            <p className="mt-3 text-xs text-[#404040]">
              Runs when you click the play button
            </p>
          </div>
        )}
        {hasRunScript &&
          !runTab?.command &&
          activeTabId === runTab?.terminalId && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface">
              <button
                type="button"
                onClick={onRunScript}
                className="flex items-center gap-2.5 rounded-lg border border-edge px-5 py-3 text-sm text-muted transition-colors hover:bg-surface-elevated hover:text-primary hover:border-edge-hover"
              >
                <FiPlay className="h-5 w-5" aria-hidden="true" />
                <span>Run</span>
              </button>
              <p className="mt-3 text-xs text-[#404040]">
                Runs when you click the play button
              </p>
            </div>
          )}

        {/* All messages' terminals — persistently mounted to preserve PTYs */}
        {allTerminalEntries.flatMap((entry) =>
          entry.terminals.map((t) => {
            const isSetupIdle = t.name === "Setup" && !t.command;
            const isRunIdle = t.name === "Run" && !t.command;
            // Show setup tab with initialContent when we have captured output
            const setupInitialContent = isSetupIdle && entry.workspaceId === currentWorkspaceId ? setupOutput : undefined;
            if (isSetupIdle && !setupInitialContent) return null;
            if (isRunIdle) return null;
            const isCurrent = entry.workspaceId === currentWorkspaceId;
            const isActiveTab = t.terminalId === entry.activeTabId;
            return (
              <TerminalTabContent
                key={t.terminalId}
                terminalId={t.terminalId}
                cwd={entry.cwd}
                command={t.command}
                visible={isCurrent && isActiveTab}
                env={t.env}
                readOnly={t.readOnly}
                fontFamily={terminalFontFamily}
                initialContent={setupInitialContent}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}
