import { useState, useEffect, useRef, useCallback } from 'react';
import { FiCheck, FiChevronDown, FiCpu } from 'react-icons/fi';
import { Tooltip } from './Tooltip';
import type { ClaudeModel, EffortLevel } from '../types';

const MODEL_OPTIONS: { value: ClaudeModel; label: string }[] = [
  { value: 'opus', label: 'Opus 4.6' },
  { value: 'sonnet', label: 'Sonnet 4.6' },
  { value: 'haiku', label: 'Haiku 4.5' },
];

const MODEL_LABELS: Record<ClaudeModel, string> = {
  opus: 'Opus 4.6',
  sonnet: 'Sonnet 4.6',
  haiku: 'Haiku 4.5',
};

function EffortDots({ effort }: { effort: EffortLevel }) {
  const opaque = effort === 'high' ? 3 : effort === 'medium' ? 2 : 1;
  return (
    <div className="flex flex-col-reverse items-center gap-[2px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`block h-[3px] w-[3px] rounded-full transition-opacity duration-150 ${
            i < opaque ? 'bg-violet-400 opacity-100' : 'bg-violet-400 opacity-30'
          }`}
        />
      ))}
    </div>
  );
}

const EFFORT_CYCLE: EffortLevel[] = ['low', 'medium', 'high'];
const EFFORT_LABELS: Record<EffortLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const LINE_H = 16;

function EffortToggle({ effort, onCycle }: { effort: EffortLevel; onCycle: () => void }) {
  // Monotonic counter — only ever increments, so animation always goes one direction
  const [counter, setCounter] = useState(EFFORT_CYCLE.indexOf(effort));
  const [widths, setWidths] = useState<number[]>([]);
  const prevEffort = useRef(effort);
  const measureRef = useCallback((el: HTMLSpanElement | null) => {
    if (!el) return;
    const w: number[] = [];
    for (let i = 0; i < el.children.length; i++) {
      w.push(Math.ceil((el.children[i] as HTMLElement).getBoundingClientRect().width));
    }
    setWidths(w);
  }, []);

  useEffect(() => {
    if (effort === prevEffort.current) return;
    prevEffort.current = effort;
    setCounter((c) => c + 1);
  }, [effort]);

  // Generate labels from 0 to counter+1 so translateY always increases
  const labels: EffortLevel[] = [];
  for (let i = 0; i <= counter + 1; i++) {
    labels.push(EFFORT_CYCLE[i % 3]);
  }

  const effortIndex = EFFORT_CYCLE.indexOf(effort);
  const currentWidth = widths.length ? widths[effortIndex] : undefined;

  return (
    <Tooltip text="Effort">
      <button
        type="button"
        onClick={onCycle}
        className="flex items-center gap-1.5 rounded-lg border border-[#292e42] bg-[#1a1b26] px-2.5 py-1 text-xs font-medium text-[#a9b1d6] transition-colors hover:border-[#3b3f5c] hover:bg-[#1f2335]"
      >
        <EffortDots effort={effort} />
        {/* Hidden measurement spans */}
        <span ref={measureRef} className="pointer-events-none fixed -left-[9999px] flex gap-4 text-xs font-medium opacity-0" aria-hidden="true">
          {EFFORT_CYCLE.map(e => <span key={e}>{EFFORT_LABELS[e]}</span>)}
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
            {labels.map((e, i) => (
              <span key={i} className="block" style={{ height: LINE_H, lineHeight: `${LINE_H}px` }}>
                {EFFORT_LABELS[e]}
              </span>
            ))}
          </span>
        </span>
      </button>
    </Tooltip>
  );
}

interface ModelEffortSelectorProps {
  model: ClaudeModel;
  effort: EffortLevel;
  onModelChange: (model: ClaudeModel) => void;
  onEffortChange: (effort: EffortLevel) => void;
}

export function ModelEffortSelector({
  model,
  effort,
  onModelChange,
  onEffortChange,
}: ModelEffortSelectorProps) {
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelOpen]);

  const handleModelSelect = useCallback((value: ClaudeModel) => {
    onModelChange(value);
    setModelOpen(false);
  }, [onModelChange]);

  const supportsEffort = model !== 'haiku';

  return (
    <div className="flex items-center gap-1.5">
      {/* Model selector chip */}
      <div className="relative" ref={modelRef}>
        <button
          type="button"
          onClick={() => setModelOpen(!modelOpen)}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
            modelOpen
              ? 'border-violet-500 bg-violet-500/20 text-violet-200'
              : 'border-[#292e42] bg-[#1a1b26] text-[#a9b1d6] hover:border-[#3b3f5c] hover:bg-[#1f2335]'
          }`}
        >
          <FiCpu className="h-3 w-3 flex-shrink-0 text-violet-400" aria-hidden="true" />
          {MODEL_LABELS[model]}
          <FiChevronDown className="h-3 w-3 opacity-50" aria-hidden="true" />
        </button>

        {modelOpen && (
          <div className="absolute bottom-full left-0 mb-1 w-44 rounded-md border border-[#292e42] bg-[#1f2335] py-1 shadow-lg z-50">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#565f89]">
              Claude Code
            </div>
            {MODEL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleModelSelect(opt.value); }}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  model === opt.value
                    ? 'bg-violet-500/20 text-violet-200'
                    : 'text-[#a9b1d6] hover:bg-[#292e42]'
                }`}
              >
                {model === opt.value ? (
                  <FiCheck className="h-3 w-3 text-violet-400" aria-hidden="true" />
                ) : (
                  <span className="w-3" />
                )}
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Effort cycling toggle (hidden for Haiku) */}
      {supportsEffort && (
        <EffortToggle effort={effort} onCycle={() => {
          const cycle: EffortLevel[] = ['low', 'medium', 'high'];
          onEffortChange(cycle[(cycle.indexOf(effort) + 1) % cycle.length]);
        }} />
      )}
    </div>
  );
}
