import { memo } from 'react';
import { Terminal } from './Terminal';

interface ChannelTerminalTabProps {
  channelId: string;
  repoPath: string;
}

export const ChannelTerminalTab = memo(function ChannelTerminalTab({
  channelId,
  repoPath,
}: ChannelTerminalTabProps) {
  const terminalId = `channel-terminal-${channelId}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Terminal terminalId={terminalId} cwd={repoPath} />
    </div>
  );
});
