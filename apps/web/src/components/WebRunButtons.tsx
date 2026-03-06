import { useEffect, useState, useRef } from 'react';
import { FiEdit3, FiMap, FiHelpCircle } from 'react-icons/fi';
import { WebModelEffortSelector } from './WebModelEffortSelector';
import { useAgentRunStore } from '../stores/agentRunStore';

type InteractionMode = 'code' | 'plan' | 'ask';

const MODE_CYCLE: InteractionMode[] = ['code', 'plan', 'ask'];
const MODE_CONFIG: Record<
  InteractionMode,
  { label: string; icon: React.ReactNode; style: string }
> = {
  code: {
    label: 'Code',
    icon: <FiEdit3 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
    style: 'btn-secondary border-edge text-primary',
  },
  plan: {
    label: 'Plan',
    icon: <FiMap className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
    style: 'border-accent bg-accent/20 text-accent-light',
  },
  ask: {
    label: 'Ask',
    icon: <FiHelpCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
    style: 'border-amber-500 bg-amber-500/20 text-amber-300',
  },
};

interface WebRunButtonsProps {
  initialPrompt: string;
  workspaceId: string;
  channelId: string;
  disabled?: boolean;
  onRun: (params: {
    prompt: string;
    model: string;
    effort: string;
    planMode: boolean;
  }) => Promise<void>;
}

export function WebRunButtons({
  initialPrompt,
  workspaceId,
  disabled,
  onRun,
}: WebRunButtonsProps) {
  const selectedModel = useAgentRunStore((s) => s.selectedModel);
  const selectedEffort = useAgentRunStore((s) => s.selectedEffort);
  const setSelectedModel = useAgentRunStore((s) => s.setSelectedModel);
  const setSelectedEffort = useAgentRunStore((s) => s.setSelectedEffort);

  const [prompt, setPrompt] = useState(initialPrompt);
  const [mode, setMode] = useState<InteractionMode>('plan');
  const [running, setRunning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [workspaceId]);

  const cycleMode = () => {
    setMode((m) => MODE_CYCLE[(MODE_CYCLE.indexOf(m) + 1) % MODE_CYCLE.length]);
  };

  const handleRun = async () => {
    if (!prompt.trim() || disabled || running) return;

    let finalPrompt = prompt;
    if (mode === 'plan') {
      finalPrompt = `Before implementing, first create a detailed plan and present it for review. Use plan mode. Once the plan is approved, proceed with implementation.\n\n${prompt}`;
    } else if (mode === 'ask') {
      finalPrompt = `<trace-internal>\nDo NOT modify any files. Only read files and answer questions. Do not use Edit, Write, or NotebookEdit tools. This is read-only/ask mode.\n</trace-internal>\n\n${prompt}`;
    }

    setRunning(true);
    try {
      await onRun({
        prompt: finalPrompt,
        model: selectedModel,
        effort: selectedEffort,
        planMode: mode === 'plan',
      });
      // Keep running=true — the component will unmount when the workspace
      // status transitions away from "pending" via subscription.
    } catch {
      setRunning(false);
    }
  };

  const config = MODE_CONFIG[mode];

  return (
    <div className="border-t border-edge px-3 py-3">
      <textarea
        ref={textareaRef}
        rows={1}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void handleRun();
          }
        }}
        disabled={disabled}
        placeholder="What would you like to build?"
        style={
          {
            fieldSizing: 'content',
            minHeight: 38,
            maxHeight: 300,
          } as React.CSSProperties
        }
        className={`mb-2 w-full resize-none rounded-md border bg-surface px-3 py-2 text-sm text-primary outline-none transition-colors placeholder:text-muted focus:border-edge-hover ${
          disabled ? 'cursor-not-allowed border-edge opacity-50' : 'border-edge'
        }`}
      />
      <div className="mb-2 flex items-center gap-1.5">
        <WebModelEffortSelector
          model={selectedModel}
          effort={selectedEffort}
          onModelChange={setSelectedModel}
          onEffortChange={setSelectedEffort}
        />
        <button
          type="button"
          onClick={cycleMode}
          disabled={disabled}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${config.style}`}
        >
          {config.icon}
          {config.label}
        </button>
      </div>
      <button
        type="button"
        onClick={() => void handleRun()}
        disabled={disabled || !prompt.trim() || running}
        className="btn-primary w-full cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? 'Starting...' : 'Run'}
      </button>
    </div>
  );
}
