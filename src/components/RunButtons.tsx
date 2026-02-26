import { useEffect, useState, useRef, useCallback } from 'react';
import { FiEdit3, FiMap, FiHelpCircle } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import { ModelEffortSelector } from './ModelEffortSelector';
import { useClaudeActions } from '../context/ClaudeActionsContext';

export type InteractionMode = 'code' | 'plan' | 'ask';

const MODE_CYCLE: InteractionMode[] = ['code', 'plan', 'ask'];
const MODE_LABELS: Record<InteractionMode, string> = { code: 'Code', plan: 'Plan', ask: 'Ask' };
const MODE_ICONS: Record<InteractionMode, React.ReactNode> = {
  code: <FiEdit3 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
  plan: <FiMap className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
  ask: <FiHelpCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
};
const MODE_TOOLTIPS: Record<InteractionMode, string> = {
  code: 'Code mode – Claude can edit files',
  plan: 'Plan mode – Claude plans before coding',
  ask: 'Ask mode – read-only, no file changes',
};

const LINE_H = 16;

function InteractionModeToggle({
  mode,
  onCycle,
}: {
  mode: InteractionMode;
  onCycle: () => void;
}) {
  const [counter, setCounter] = useState(MODE_CYCLE.indexOf(mode));
  const [widths, setWidths] = useState<number[]>([]);
  const prevMode = useRef(mode);
  const measureRef = useCallback((el: HTMLSpanElement | null) => {
    if (!el) return;
    const w: number[] = [];
    for (let i = 0; i < el.children.length; i++) {
      w.push(Math.ceil((el.children[i] as HTMLElement).getBoundingClientRect().width));
    }
    setWidths(w);
  }, []);

  useEffect(() => {
    if (mode === prevMode.current) return;
    prevMode.current = mode;
    setCounter((c) => c + 1);
  }, [mode]);

  const labels: InteractionMode[] = [];
  for (let i = 0; i <= counter + 1; i++) {
    labels.push(MODE_CYCLE[i % 3]);
  }

  const modeIndex = MODE_CYCLE.indexOf(mode);
  const currentWidth = widths.length ? widths[modeIndex] : undefined;

  return (
    <Tooltip text={MODE_TOOLTIPS[mode]}>
      <button
        type="button"
        onClick={onCycle}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
          mode === 'code'
            ? 'border-[#292e42] bg-[#1a1b26] text-[#a9b1d6] hover:border-[#3b3f5c] hover:bg-[#1f2335]'
            : mode === 'plan'
              ? 'border-violet-500 bg-violet-500/20 text-violet-300'
              : 'border-amber-500 bg-amber-500/20 text-amber-300'
        }`}
      >
        {MODE_ICONS[mode]}
        {/* Hidden measurement spans */}
        <span ref={measureRef} className="pointer-events-none fixed -left-[9999px] flex gap-4 text-xs font-medium opacity-0" aria-hidden="true">
          {MODE_CYCLE.map(m => <span key={m}>{MODE_LABELS[m]}</span>)}
        </span>
        {/* Visible roller */}
        <span
          className="relative overflow-hidden"
          style={{
            height: LINE_H,
            width: currentWidth,
            transition: widths.length ? 'width 150ms ease' : undefined,
          }}
        >
          <span
            className="flex flex-col"
            style={{
              transform: `translateY(-${counter * LINE_H}px)`,
              transition: 'transform 150ms ease',
            }}
          >
            {labels.map((m, i) => (
              <span key={i} className="block" style={{ height: LINE_H, lineHeight: `${LINE_H}px` }}>
                {MODE_LABELS[m]}
              </span>
            ))}
          </span>
        </span>
      </button>
    </Tooltip>
  );
}

export { InteractionModeToggle };

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
  const [mode, setMode] = useState<InteractionMode>('code');
  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  const cycleMode = () => setMode((m) => MODE_CYCLE[(MODE_CYCLE.indexOf(m) + 1) % 3]);

  const handleRun = () => {
    let finalPrompt = prompt;
    if (mode === 'ask') {
      finalPrompt = `Do NOT modify any files. Only read files and answer questions. Do not use Edit, Write, or NotebookEdit tools. This is read-only/ask mode.\n\n${prompt}`;
    }
    onRun(mode === 'plan', finalPrompt);
  };

  return (
    <div className="border-t border-[#292e42] px-3 py-3">
      <textarea
        rows={1}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleRun();
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
        <InteractionModeToggle mode={mode} onCycle={cycleMode} />
      </div>
      <button
        type="button"
        onClick={handleRun}
        className="w-full cursor-pointer rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700"
      >
        Run
      </button>
    </div>
  );
}
