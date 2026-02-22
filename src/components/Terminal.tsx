import { useTerminal } from '../hooks/useTerminal';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  terminalId: string;
  cwd: string;
}

export function Terminal({ terminalId, cwd }: TerminalProps) {
  const { containerRef } = useTerminal({ terminalId, cwd });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center border-b border-[#292e42] px-3 py-1.5">
        <h4 className="text-xs font-semibold text-[#565f89]">Terminal</h4>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 p-1" />
    </div>
  );
}
