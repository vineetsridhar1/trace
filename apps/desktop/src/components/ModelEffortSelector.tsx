import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { FiCheck, FiChevronDown, FiCpu } from "react-icons/fi";
import { Tooltip } from "./Tooltip";
import type { AgentType, EffortOption } from "../types";
import {
  useAgentRunStore,
  getEffortOptions,
  getEffortLabel,
} from "../stores/agentRunStore";

function EffortDots({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex flex-col-reverse items-center gap-[2px]">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`block h-[3px] w-[3px] rounded-full transition-opacity duration-150 ${
            i <= index
              ? "bg-accent-light opacity-100"
              : "bg-accent-light opacity-30"
          }`}
        />
      ))}
    </div>
  );
}

const LINE_H = 16;

function EffortToggle({
  effort,
  options,
  effortLabel,
  onCycle,
}: {
  effort: string;
  options: EffortOption[];
  effortLabel: string;
  onCycle: () => void;
}) {
  const currentIndex = options.findIndex((o) => o.value === effort);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;

  // Monotonic counter — only ever increments, so animation always goes one direction
  const [counter, setCounter] = useState(safeIndex);
  const [widths, setWidths] = useState<number[]>([]);
  const prevEffort = useRef(effort);
  const measureRef = useCallback((el: HTMLSpanElement | null) => {
    if (!el) return;
    const w: number[] = [];
    for (let i = 0; i < el.children.length; i++) {
      w.push(
        Math.ceil(
          (el.children[i] as HTMLElement).getBoundingClientRect().width,
        ),
      );
    }
    setWidths(w);
  }, []);

  useEffect(() => {
    if (effort === prevEffort.current) return;
    prevEffort.current = effort;
    setCounter((c) => c + 1);
  }, [effort]);

  // Generate labels from 0 to counter+1 so translateY always increases
  const labels: EffortOption[] = [];
  for (let i = 0; i <= counter + 1; i++) {
    labels.push(options[i % options.length]);
  }

  const currentWidth = widths.length ? widths[safeIndex] : undefined;

  return (
    <Tooltip text={effortLabel}>
      <button
        type="button"
        onClick={onCycle}
        className="btn-secondary flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1 text-xs font-medium text-primary"
      >
        <EffortDots index={safeIndex} total={options.length} />
        {/* Hidden measurement spans */}
        <span
          ref={measureRef}
          className="pointer-events-none fixed -left-[9999px] flex gap-4 text-xs font-medium opacity-0"
          aria-hidden="true"
        >
          {options.map((o) => (
            <span key={o.value}>{o.label}</span>
          ))}
        </span>
        {/* Visible roller */}
        <span
          className="relative overflow-hidden"
          style={{
            height: LINE_H,
            width: currentWidth,
            transition: widths.length ? "width 150ms ease" : undefined,
          }}
        >
          <span
            className="flex flex-col"
            style={{
              transform: `translateY(-${counter * LINE_H}px)`,
              transition: "transform 150ms ease",
            }}
          >
            {labels.map((o, i) => (
              <span
                key={i}
                className="block"
                style={{ height: LINE_H, lineHeight: `${LINE_H}px` }}
              >
                {o.label}
              </span>
            ))}
          </span>
        </span>
      </button>
    </Tooltip>
  );
}

interface ModelEffortSelectorProps {
  agent: AgentType;
  model: string;
  effort: string;
  onAgentChange: (agent: AgentType) => void;
  onModelChange: (model: string) => void;
  onEffortChange: (effort: string) => void;
}

export function ModelEffortSelector({
  agent,
  model,
  effort,
  onAgentChange,
  onModelChange,
  onEffortChange,
}: ModelEffortSelectorProps) {
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const detectedAgents = useAgentRunStore((s) => s.detectedAgents);

  const agentTypes = useMemo(
    () => detectedAgents.map((a) => a.type),
    [detectedAgents],
  );

  useEffect(() => {
    if (!modelOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelOpen]);

  const agentCaps = detectedAgents.find((a) => a.type === agent)?.capabilities;
  const models = agentCaps?.models ?? [];
  const modelLabel = models.find((m) => m.value === model)?.label ?? model;

  const handleAgentSelect = useCallback(
    (newAgent: AgentType) => {
      onAgentChange(newAgent);
      const caps = detectedAgents.find(
        (a) => a.type === newAgent,
      )?.capabilities;
      onModelChange(caps?.models[0]?.value ?? caps?.defaultModel ?? "");
      setModelOpen(false);
    },
    [detectedAgents, onAgentChange, onModelChange],
  );

  const handleModelSelect = useCallback(
    (value: string) => {
      onModelChange(value);
      setModelOpen(false);
    },
    [onModelChange],
  );

  const effortOptions = getEffortOptions(agent, model);
  const effortLabel = getEffortLabel(agent);

  return (
    <div className="flex items-center gap-1.5">
      {/* Model selector chip */}
      <div className="relative" ref={modelRef}>
        <button
          type="button"
          onClick={() => setModelOpen(!modelOpen)}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${
            modelOpen
              ? "border-accent bg-accent/20 text-accent-light"
              : "btn-secondary border-edge text-primary"
          }`}
        >
          <FiCpu
            className="h-3 w-3 flex-shrink-0 text-accent-light"
            aria-hidden="true"
          />
          {modelLabel}
          <FiChevronDown className="h-3 w-3 opacity-50" aria-hidden="true" />
        </button>

        {modelOpen && (
          <div className="absolute bottom-full left-0 mb-1 w-44 rounded-md border border-edge bg-surface-elevated py-1 shadow-lg z-50">
            {agentTypes.map((agentType) => {
              const caps = detectedAgents.find(
                (a) => a.type === agentType,
              )?.capabilities;
              if (!caps) return null;
              return (
                <div key={agentType}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (agentType !== agent) handleAgentSelect(agentType);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                      agentType === agent
                        ? "text-accent-light"
                        : "cursor-pointer text-muted hover:text-primary"
                    }`}
                  >
                    {caps.displayName}
                  </button>
                  {agentType === agent &&
                    caps.models.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleModelSelect(opt.value);
                        }}
                        className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                          model === opt.value
                            ? "bg-accent/20 text-accent-light"
                            : "text-primary hover:bg-surface-elevated"
                        }`}
                      >
                        {model === opt.value ? (
                          <FiCheck
                            className="h-3 w-3 text-accent-light"
                            aria-hidden="true"
                          />
                        ) : (
                          <span className="w-3" />
                        )}
                        {opt.label}
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Effort cycling toggle (hidden when model has no effort options) */}
      {effortOptions.length > 0 && (
        <EffortToggle
          effort={effort}
          options={effortOptions}
          effortLabel={effortLabel}
          onCycle={() => {
            const idx = effortOptions.findIndex((o) => o.value === effort);
            const next = effortOptions[(idx + 1) % effortOptions.length];
            onEffortChange(next.value);
          }}
        />
      )}
    </div>
  );
}
