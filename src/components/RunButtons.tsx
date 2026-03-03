import { useEffect, useState, useRef, useCallback } from "react";
import { FiEdit3, FiMap, FiHelpCircle, FiChevronDown } from "react-icons/fi";
import { Tooltip } from "./Tooltip";
import { ModelEffortSelector } from "./ModelEffortSelector";
import { TicketDependencySelector } from "./TicketDependencySelector";
import { ImageThumbnails } from "./ImageThumbnails";
import { useAgentRunStore } from "../stores/agentRunStore";
import { useImageAttachments } from "../hooks/useImageAttachments";

export type InteractionMode = "code" | "plan" | "ask";

const MODE_CYCLE: InteractionMode[] = ["code", "plan", "ask"];
const MODE_LABELS: Record<InteractionMode, string> = {
  code: "Code",
  plan: "Plan",
  ask: "Ask",
};
const MODE_ICONS: Record<InteractionMode, React.ReactNode> = {
  code: <FiEdit3 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
  plan: <FiMap className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />,
  ask: (
    <FiHelpCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
  ),
};
const MODE_TOOLTIPS: Record<InteractionMode, string> = {
  code: "Code mode – Claude can edit files",
  plan: "Plan mode – Claude plans before coding",
  ask: "Ask mode – read-only, no file changes",
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
      w.push(
        Math.ceil(
          (el.children[i] as HTMLElement).getBoundingClientRect().width,
        ),
      );
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
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${
          mode === "code"
            ? "btn-secondary border-edge text-primary"
            : mode === "plan"
              ? "border-accent bg-accent/20 text-accent-light"
              : "border-amber-500 bg-amber-500/20 text-amber-300"
        }`}
      >
        {MODE_ICONS[mode]}
        {/* Hidden measurement spans */}
        <span
          ref={measureRef}
          className="pointer-events-none fixed -left-[9999px] flex gap-4 text-xs font-medium opacity-0"
          aria-hidden="true"
        >
          {MODE_CYCLE.map((m) => (
            <span key={m}>{MODE_LABELS[m]}</span>
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
            {labels.map((m, i) => (
              <span
                key={i}
                className="block"
                style={{ height: LINE_H, lineHeight: `${LINE_H}px` }}
              >
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

export interface ChannelTicketInfo {
  workspaceId: string;
  title: string;
  status: string;
}

export function RunButtons({
  initialPrompt,
  onRun,
  channelTickets,
  currentWorkspaceId,
  onRunAfter,
}: {
  initialPrompt: string;
  onRun: (
    planMode: boolean,
    prompt: string,
    attachmentIds?: string[],
    filePaths?: string[],
  ) => Promise<void> | void;
  channelTickets?: ChannelTicketInfo[];
  currentWorkspaceId?: string;
  onRunAfter?: (
    dependsOnWorkspaceIds: string[],
    runConfig: {
      prompt: string;
      model: string;
      effort: string;
      planMode: boolean;
    },
  ) => void;
}) {
  const selectedAgent = useAgentRunStore((s) => s.selectedAgent);
  const selectedModel = useAgentRunStore((s) => s.selectedModel);
  const selectedEffort = useAgentRunStore((s) => s.selectedEffort);
  const setSelectedAgent = useAgentRunStore((s) => s.setSelectedAgent);
  const setSelectedModel = useAgentRunStore((s) => s.setSelectedModel);
  const setSelectedEffort = useAgentRunStore((s) => s.setSelectedEffort);
  const detectedAgents = useAgentRunStore((s) => s.detectedAgents);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [mode, setMode] = useState<InteractionMode>("plan");
  const [showRunAfter, setShowRunAfter] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    attachments,
    uploading,
    handlePaste,
    removeAttachment,
    clearAttachments,
    getAttachmentIds,
    getFilePaths,
  } = useImageAttachments();

  const supportsPlanMode =
    detectedAgents.find((a) => a.type === selectedAgent)?.capabilities
      .supportsPlanMode ?? true;

  useEffect(() => {
    setPrompt(initialPrompt);
  }, [initialPrompt]);

  // Auto-focus textarea when workspace changes
  useEffect(() => {
    textareaRef.current?.focus();
  }, [currentWorkspaceId]);

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  // When agent changes and doesn't support plan, reset to 'code'
  useEffect(() => {
    if (!supportsPlanMode && mode === "plan") setMode("code");
  }, [supportsPlanMode, mode]);

  const cycleMode = () => {
    const cycle = supportsPlanMode
      ? MODE_CYCLE
      : MODE_CYCLE.filter((m) => m !== "plan");
    setMode((m) => cycle[(cycle.indexOf(m) + 1) % cycle.length]);
  };

  const handleRun = () => {
    let finalPrompt = prompt;
    if (mode === "ask") {
      finalPrompt = `<trace-internal>\nDo NOT modify any files. Only read files and answer questions. Do not use Edit, Write, or NotebookEdit tools. This is read-only/ask mode.\n</trace-internal>\n\n${prompt}`;
    }
    const ids = getAttachmentIds();
    const paths = getFilePaths();
    onRun(
      mode === "plan",
      finalPrompt,
      ids.length > 0 ? ids : undefined,
      paths.length > 0 ? paths : undefined,
    );
    clearAttachments();
  };

  const handleRunAfter = (depIds: string[]) => {
    if (!onRunAfter) return;
    let finalPrompt = prompt;
    if (mode === "ask") {
      finalPrompt = `<trace-internal>\nDo NOT modify any files. Only read files and answer questions. Do not use Edit, Write, or NotebookEdit tools. This is read-only/ask mode.\n</trace-internal>\n\n${prompt}`;
    }
    onRunAfter(depIds, {
      prompt: finalPrompt,
      model: selectedModel,
      effort: selectedEffort,
      planMode: mode === "plan",
    });
    setShowRunAfter(false);
  };

  const hasRunAfter =
    channelTickets &&
    channelTickets.length > 0 &&
    onRunAfter &&
    attachments.length === 0;

  return (
    <div className="border-t border-edge px-3 py-3">
      <textarea
        ref={textareaRef}
        rows={1}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleRun();
          }
        }}
        placeholder="What would you like to build?"
        style={
          {
            fieldSizing: "content",
            minHeight: 38,
            maxHeight: 300,
          } as React.CSSProperties
        }
        className="mb-2 w-full resize-none rounded-md border border-edge bg-surface px-3 py-2 text-sm text-primary outline-none transition-colors placeholder:text-muted focus:border-edge-hover"
      />
      <ImageThumbnails images={attachments} onRemove={removeAttachment} />
      {uploading && (
        <div className="mb-2 text-xs text-muted">Uploading image...</div>
      )}
      <div className="mb-2 flex items-center gap-1.5">
        <ModelEffortSelector
          agent={selectedAgent}
          model={selectedModel}
          effort={selectedEffort}
          onAgentChange={setSelectedAgent}
          onModelChange={setSelectedModel}
          onEffortChange={setSelectedEffort}
        />
        <InteractionModeToggle mode={mode} onCycle={cycleMode} />
      </div>
      <div className="relative flex">
        <button
          type="button"
          onClick={handleRun}
          className={`btn-primary flex-1 cursor-pointer px-4 py-2 text-sm font-medium text-on-accent ${hasRunAfter ? "rounded-l-md" : "rounded-md"}`}
        >
          Run
        </button>
        {hasRunAfter && (
          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              className="btn-primary flex cursor-pointer items-center rounded-r-md border-l border-accent-light/30 px-2 py-2 text-on-accent"
            >
              <FiChevronDown className="h-4 w-4" />
            </button>
            {showDropdown && (
              <div className="absolute bottom-full right-0 mb-1 w-40 rounded-md border border-edge bg-surface-elevated py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setShowDropdown(false);
                    setShowRunAfter(true);
                  }}
                  className="w-full cursor-pointer px-3 py-1.5 text-left text-sm text-primary hover:bg-surface-elevated"
                >
                  Run After...
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {showRunAfter && channelTickets && currentWorkspaceId && (
        <TicketDependencySelector
          tickets={channelTickets.filter(
            (t) => t.workspaceId !== currentWorkspaceId,
          )}
          onConfirm={handleRunAfter}
          onCancel={() => setShowRunAfter(false)}
        />
      )}
    </div>
  );
}
