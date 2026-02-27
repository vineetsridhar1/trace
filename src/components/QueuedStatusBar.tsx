import { useState } from 'react';
import { FiClock, FiX } from 'react-icons/fi';
import { useTicketDependenciesQuery } from './__generated__/TicketView.generated';
import { ModelEffortSelector } from './ModelEffortSelector';
import { InteractionModeToggle } from './RunButtons';
import type { InteractionMode } from './RunButtons';
import type { ClaudeModel, EffortLevel } from '../types';
import { useThreadContext } from '../context/ThreadContext';

const MODE_CYCLE: InteractionMode[] = ['code', 'plan', 'ask'];

export function QueuedStatusBar({ messageId }: { messageId: string }) {
  const {
    removeTicketDependency,
    updateQueuedRunConfig,
    queuedRunConfig,
  } = useThreadContext();

  const { data } = useTicketDependenciesQuery({ variables: { messageId } });
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
    updateQueuedRunConfig(messageId, {
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
              {dep.dependsOnTicketTitle ?? dep.dependsOnMessageId}
              <button
                type="button"
                onClick={() => removeTicketDependency(messageId, dep.dependsOnMessageId)}
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
