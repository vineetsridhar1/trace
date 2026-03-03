import type { RefObject } from 'react';
import { usePanelLayoutStore } from '../../stores/panelLayoutStore';
import { useSingletonRect } from './useSingletonRect';
import { TerminalTabs } from '../TerminalTabs';
import { BrowserTab } from '../BrowserTab';
import type { TerminalTab, TerminalEntry } from '../../stores/terminalStore';

interface SingletonLayerProps {
  containerRef: RefObject<HTMLDivElement | null>;
  singletonClaimRefs: Map<string, RefObject<HTMLDivElement | null>>;
  // Terminal props
  terminals: TerminalTab[];
  allTerminalEntries: TerminalEntry[];
  currentWorkspaceId: string | null;
  activeTerminalTabId: string | null;
  terminalCwd: string;
  runScriptRunning: boolean;
  scriptsAvailable: boolean;
  hasSetupScript: boolean;
  hasRunScript: boolean;
  ptyProcesses: Record<string, { processName: string; isShellOnly: boolean }>;
  hasWorktree: boolean | null;
  onSelectTab: (terminalId: string) => void;
  onCloseTab: (terminalId: string) => void;
  onCloseAll: () => void;
  onAddTab: () => void;
  onRunScript: () => void;
  onStopScript: () => void;
  onRerunSetup: () => void;
  onOpenSettings: () => void;
  // Browser props
  browserWorkspaceId: string | null;
}

export function SingletonLayer({
  containerRef,
  singletonClaimRefs,
  terminals,
  allTerminalEntries,
  currentWorkspaceId,
  activeTerminalTabId,
  terminalCwd,
  runScriptRunning,
  scriptsAvailable,
  hasSetupScript,
  hasRunScript,
  ptyProcesses,
  hasWorktree,
  onSelectTab,
  onCloseTab,
  onCloseAll,
  onAddTab,
  onRunScript,
  onStopScript,
  onRerunSetup,
  onOpenSettings,
  browserWorkspaceId,
}: SingletonLayerProps) {
  const terminalPaneId = usePanelLayoutStore((s) => s.singletonOwners.terminal);
  const browserPaneId = usePanelLayoutStore((s) => s.singletonOwners.browser);

  const terminalClaimRef = terminalPaneId ? singletonClaimRefs.get(terminalPaneId) ?? null : null;
  const browserClaimRef = browserPaneId ? singletonClaimRefs.get(browserPaneId) ?? null : null;

  const terminalRect = useSingletonRect(terminalClaimRef, containerRef);
  const browserRect = useSingletonRect(browserClaimRef, containerRef);

  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 10 }}>
      {/* Terminal — always mounted to preserve PTYs */}
      <div
        className="pointer-events-auto flex flex-col overflow-hidden"
        style={{
          display: terminalPaneId ? 'flex' : 'none',
          position: 'absolute',
          top: terminalRect.top,
          left: terminalRect.left,
          width: terminalRect.width,
          height: terminalRect.height,
        }}
      >
        {hasWorktree === false ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            No worktree available
          </div>
        ) : allTerminalEntries.length > 0 ? (
          <TerminalTabs
            terminals={terminals}
            allTerminalEntries={allTerminalEntries}
            currentWorkspaceId={currentWorkspaceId}
            activeTabId={activeTerminalTabId}
            cwd={terminalCwd}
            runScriptRunning={runScriptRunning}
            scriptsAvailable={scriptsAvailable}
            hasSetupScript={hasSetupScript}
            hasRunScript={hasRunScript}
            ptyProcesses={ptyProcesses}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
            onCloseAll={onCloseAll}
            onAddTab={onAddTab}
            onRunScript={onRunScript}
            onStopScript={onStopScript}
            onRerunSetup={onRerunSetup}
            onOpenSettings={onOpenSettings}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">
            Initializing terminals...
          </div>
        )}
      </div>

      {/* Browser — always mounted to preserve webview state */}
      <div
        className="pointer-events-auto flex flex-col overflow-hidden"
        style={{
          display: browserPaneId ? 'flex' : 'none',
          position: 'absolute',
          top: browserRect.top,
          left: browserRect.left,
          width: browserRect.width,
          height: browserRect.height,
        }}
      >
        <BrowserTab workspaceId={browserWorkspaceId} />
      </div>
    </div>
  );
}
