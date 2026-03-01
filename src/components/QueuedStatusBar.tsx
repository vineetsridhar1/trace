import { useCallback, useMemo, useState } from 'react';
import { FiClock, FiX } from 'react-icons/fi';
import { gql } from '@apollo/client';
import { useTicketDependenciesQuery } from './__generated__/TicketView.generated';
import { useRemoveTicketDependencyMutation, useUpdateQueuedRunConfigMutation } from './__generated__/QueuedStatusBar.generated';
import { ModelEffortSelector } from './ModelEffortSelector';
import { InteractionModeToggle } from './RunButtons';
import type { InteractionMode } from './RunButtons';
import type { ClaudeModel, EffortLevel } from '../types';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useChannelContext } from '../context/ChannelContext';

// These GQL definitions are already in App.generated but we need the reference for codegen
const _GQL_REMOVE_TICKET_DEPENDENCY = gql`
  mutation RemoveTicketDependency($channelId: ID!, $workspaceId: ID!, $dependsOnWorkspaceId: ID!) {
    removeTicketDependency(channelId: $channelId, workspaceId: $workspaceId, dependsOnWorkspaceId: $dependsOnWorkspaceId)
  }
`;

const _GQL_UPDATE_QUEUED_RUN_CONFIG = gql`
  mutation UpdateQueuedRunConfig($workspaceId: ID!, $runConfig: JSON!) {
    updateQueuedRunConfig(workspaceId: $workspaceId, runConfig: $runConfig)
  }
`;

const MODE_CYCLE: InteractionMode[] = ['code', 'plan', 'ask'];

export function QueuedStatusBar({ workspaceId }: { workspaceId: string }) {
  const { activeChannelId } = useChannelContext();
  const workspaces = useWorkspaceStore((s) => s.workspaces);

  const queuedRunConfig = useMemo(() => {
    const ws = workspaces.find((w) => w.id === workspaceId);
    return ws?.queuedRunConfig ?? null;
  }, [workspaces, workspaceId]);

  const [executeRemoveTicketDependency] = useRemoveTicketDependencyMutation();
  const [executeUpdateQueuedRunConfig] = useUpdateQueuedRunConfigMutation();

  const removeTicketDependency = useCallback(
    async (wsId: string, dependsOnWorkspaceId: string) => {
      if (!activeChannelId) return;
      try {
        await executeRemoveTicketDependency({ variables: { channelId: activeChannelId, workspaceId: wsId, dependsOnWorkspaceId } });
      } catch {
        console.error('Failed to remove ticket dependency');
      }
    },
    [activeChannelId, executeRemoveTicketDependency],
  );

  const updateQueuedRunConfig = useCallback(
    async (wsId: string, runConfig: { prompt: string; model: string; effort: string; planMode: boolean }) => {
      try {
        await executeUpdateQueuedRunConfig({ variables: { workspaceId: wsId, runConfig } });
      } catch {
        console.error('Failed to update queued run config');
      }
    },
    [executeUpdateQueuedRunConfig],
  );

  const { data } = useTicketDependenciesQuery({ variables: { workspaceId } });
  const deps = data?.ticketDependencies ?? [];

  const [model, setModel] = useState<ClaudeModel>(
    (queuedRunConfig?.model as ClaudeModel) ?? 'sonnet',
  );
  const [effort, setEffort] = useState<EffortLevel>(
    (queuedRunConfig?.effort as EffortLevel) ?? 'high',
  );
  const [mode, setMode] = useState<InteractionMode>(
    queuedRunConfig?.planMode ? 'plan' : 'code',
  );

  const saveConfig = (newModel: ClaudeModel, newEffort: EffortLevel, newMode: InteractionMode) => {
    if (!queuedRunConfig) return;
    void updateQueuedRunConfig(workspaceId, {
      ...queuedRunConfig,
      model: newModel,
      effort: newEffort,
      planMode: newMode === 'plan',
    });
  };

  const handleModelChange = (m: ClaudeModel) => {
    setModel(m);
    saveConfig(m, effort, mode);
  };

  const handleEffortChange = (e: EffortLevel) => {
    setEffort(e);
    saveConfig(model, e, mode);
  };

  const cycleMode = () => {
    const next = MODE_CYCLE[(MODE_CYCLE.indexOf(mode) + 1) % 3];
    setMode(next);
    saveConfig(model, effort, next);
  };

  return (
    <div className="border-t border-[#292e42] bg-cyan-500/5 px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <FiClock className="h-4 w-4 shrink-0 text-cyan-400" />
        <span className="text-sm text-cyan-300">
          Queued — will run after dependencies are merged
        </span>
      </div>

      {deps.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {deps.map((dep) => (
            <span
              key={dep.id}
              className="flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-300"
            >
              {dep.dependsOnTicketTitle ?? dep.dependsOnWorkspaceId}
              <button
                type="button"
                onClick={() => void removeTicketDependency(workspaceId, dep.dependsOnWorkspaceId)}
                className="ml-0.5 rounded p-0.5 text-cyan-400/60 transition-colors hover:bg-cyan-500/20 hover:text-cyan-300"
              >
                <FiX className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <ModelEffortSelector
          model={model}
          effort={effort}
          onModelChange={handleModelChange}
          onEffortChange={handleEffortChange}
        />
        <InteractionModeToggle mode={mode} onCycle={cycleMode} />
      </div>
    </div>
  );
}
