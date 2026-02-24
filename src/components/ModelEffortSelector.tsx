import { useState, useEffect, useRef, useCallback } from 'react';
import type { ClaudeModel, EffortLevel } from '../types';

const MODEL_OPTIONS: { value: ClaudeModel; label: string }[] = [
  { value: 'opus', label: 'Opus 4.6' },
  { value: 'sonnet', label: 'Sonnet 4.6' },
  { value: 'haiku', label: 'Haiku 4.5' },
];

const EFFORT_OPTIONS: { value: EffortLevel; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const MODEL_LABELS: Record<ClaudeModel, string> = {
  opus: 'Opus 4.6',
  sonnet: 'Sonnet 4.6',
  haiku: 'Haiku 4.5',
};

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
  const [effortOpen, setEffortOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const effortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!modelOpen && !effortOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelOpen && modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
      if (effortOpen && effortRef.current && !effortRef.current.contains(e.target as Node)) {
        setEffortOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelOpen, effortOpen]);

  const handleModelSelect = useCallback((value: ClaudeModel) => {
    onModelChange(value);
    setModelOpen(false);
  }, [onModelChange]);

  const handleEffortSelect = useCallback((value: EffortLevel) => {
    onEffortChange(value);
    setEffortOpen(false);
  }, [onEffortChange]);

  const supportsEffort = model !== 'haiku';

  return (
    <div className="flex items-center gap-1.5">
      {/* Model selector chip */}
      <div className="relative" ref={modelRef}>
        <button
          type="button"
          onClick={() => { setModelOpen(!modelOpen); setEffortOpen(false); }}
          className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
            modelOpen
              ? 'border-violet-500 bg-violet-500/20 text-violet-200'
              : 'border-[#292e42] bg-[#1a1b26] text-[#a9b1d6] hover:border-[#3b3f5c] hover:bg-[#1f2335]'
          }`}
        >
          {MODEL_LABELS[model]}
          <svg className="h-3 w-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {modelOpen && (
          <div className="absolute bottom-full left-0 mb-1 w-44 rounded-lg border border-[#292e42] bg-[#1f2335] py-1 shadow-lg z-50">
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
                  <svg className="h-3 w-3 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="w-3" />
                )}
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Effort selector chip (hidden for Haiku) */}
      {supportsEffort && (
        <div className="relative" ref={effortRef}>
          <button
            type="button"
            onClick={() => { setEffortOpen(!effortOpen); setModelOpen(false); }}
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              effortOpen
                ? 'border-violet-500 bg-violet-500/20 text-violet-200'
                : 'border-[#292e42] bg-[#1a1b26] text-[#a9b1d6] hover:border-[#3b3f5c] hover:bg-[#1f2335]'
            }`}
          >
            {effort.charAt(0).toUpperCase() + effort.slice(1)} effort
            <svg className="h-3 w-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {effortOpen && (
            <div className="absolute bottom-full left-0 mb-1 w-36 rounded-lg border border-[#292e42] bg-[#1f2335] py-1 shadow-lg z-50">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#565f89]">
                Effort
              </div>
              {EFFORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); handleEffortSelect(opt.value); }}
                  className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                    effort === opt.value
                      ? 'bg-violet-500/20 text-violet-200'
                      : 'text-[#a9b1d6] hover:bg-[#292e42]'
                  }`}
                >
                  {effort === opt.value ? (
                    <svg className="h-3 w-3 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="w-3" />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
