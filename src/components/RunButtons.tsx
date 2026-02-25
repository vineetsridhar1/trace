import { useEffect, useState } from 'react';
import { FiMap } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import { ModelEffortSelector } from './ModelEffortSelector';
import { useClaudeActions } from '../context/ClaudeActionsContext';

function PlanModeToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <Tooltip text={active ? 'Plan mode on' : 'Plan mode'}>
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-all duration-200 ${
          active
            ? 'border-violet-500 bg-violet-500/20 text-violet-300'
            : 'border-[#292e42] bg-[#1a1b26] text-[#565f89] hover:border-[#3b3f5c] hover:text-[#a9b1d6]'
        }`}
      >
        <FiMap className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span
          className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${
            active ? 'ml-1 max-w-[36px] opacity-100' : 'max-w-0 opacity-0'
          }`}
        >
          Plan
        </span>
      </button>
    </Tooltip>
  );
}

export { PlanModeToggle };

export function RunButtons({
  initialPrompt,
  onRun,
}: {
  initialPrompt: string;
  onRun: (planMode: boolean, prompt: string) => Promise<void> | void;
}) {
  const {
    selectedModel,
    selectedEffort,
    setSelectedModel,
    setSelectedEffort,
  } = useClaudeActions();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [planMode, setPlanMode] = useState(false);
  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  return (
    <div className="border-t border-[#292e42] px-3 py-3">
      <textarea
        rows={1}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onRun(planMode, prompt);
          }
        }}
        style={{ fieldSizing: 'content', minHeight: 38, maxHeight: 300 } as React.CSSProperties}
        className="mb-2 w-full resize-none rounded-md border border-[#292e42] bg-[#1a1b26] px-3 py-2 text-sm text-[#c0caf5] outline-none transition-colors placeholder:text-[#565f89] focus:border-violet-500"
      />
      <div className="mb-2 flex items-center gap-1.5">
        <ModelEffortSelector
          model={selectedModel}
          effort={selectedEffort}
          onModelChange={setSelectedModel}
          onEffortChange={setSelectedEffort}
        />
        <PlanModeToggle
          active={planMode}
          onToggle={() => setPlanMode((p) => !p)}
        />
      </div>
      <button
        type="button"
        onClick={() => onRun(planMode, prompt)}
        className="w-full cursor-pointer rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
      >
        Run
      </button>
    </div>
  );
}
