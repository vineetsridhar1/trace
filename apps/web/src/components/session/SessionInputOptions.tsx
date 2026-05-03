import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Cloud, Monitor } from "lucide-react";
import { toast } from "sonner";
import type { CodingTool, SessionConnection, SessionRuntimeInstance } from "@trace/gql";
import { useEntityField } from "@trace/client-core";
import { client } from "../../lib/urql";
import { applyOptimisticPatch } from "../../lib/optimistic-entity";
import { AVAILABLE_RUNTIMES_QUERY, UPDATE_SESSION_CONFIG_MUTATION } from "@trace/client-core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { type InteractionMode, MODE_CONFIG } from "./interactionModes";
import {
  getModelsForTool,
  getDefaultModel,
  getModelLabel,
  getReasoningEffortsForTool,
  getDefaultReasoningEffort,
  getReasoningEffortLabel,
  type ReasoningEffortOption,
} from "./modelOptions";
import { ClaudeIcon, CodexIcon } from "../ui/tool-icons";
import { cn } from "../../lib/utils";
import { useCloudAgentEnvironmentAvailable } from "../../hooks/useCloudAgentEnvironmentAvailable";
import { isAccessibleLocalRuntime } from "../../lib/bridge-access";

const UNBOUND_LOCAL_RUNTIME_ID = "__unbound_local__";
const CLOUD_RUNTIME_ID = "__cloud__";

const TOOL_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
};

const EFFORT_LINE_HEIGHT = 16;

function getToolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool;
}

function EffortDots({ index, total }: { index: number; total: number }) {
  return (
    <span className="flex flex-col-reverse items-center gap-[2px]" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "block h-[3px] w-[3px] rounded-full transition-opacity duration-150",
            i <= index ? "bg-[var(--th-accent-light)] opacity-100" : "bg-muted-foreground/40",
          )}
        />
      ))}
    </span>
  );
}

function EffortCycleButton({
  effort,
  options,
  disabled,
  onChange,
}: {
  effort: string;
  options: readonly ReasoningEffortOption[];
  disabled: boolean | undefined;
  onChange: (effort: string) => void;
}) {
  const currentIndex = options.findIndex((option) => option.value === effort);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const [counter, setCounter] = useState(safeIndex);
  const displayIndex = counter % options.length;
  const currentOption = options[displayIndex];
  const currentLabel = currentOption?.label ?? getReasoningEffortLabel(effort);
  const nextOption = options[(displayIndex + 1) % options.length];
  const tooltip = `Reasoning effort: ${currentLabel}. Click to cycle.`;
  const labels = Array.from({ length: counter + 2 }, (_, i) => options[i % options.length]);

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <button
          type="button"
          onClick={() => {
            if (!nextOption) return;
            setCounter((value) => value + 1);
            onChange(nextOption.value);
          }}
          disabled={disabled}
          aria-label={tooltip}
          className={cn(
            "btn-secondary flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 text-[11px] font-medium text-foreground transition-colors",
            "hover:border-[var(--th-accent)] hover:text-[var(--th-accent-light)]",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <EffortDots index={displayIndex} total={options.length} />
          <span
            className="relative block min-w-[4.25rem] overflow-hidden text-left"
            style={{ height: EFFORT_LINE_HEIGHT }}
          >
            <span
              className="flex flex-col transition-transform duration-150 ease-out"
              style={{ transform: `translateY(-${counter * EFFORT_LINE_HEIGHT}px)` }}
            >
              {labels.map((option, index) => (
                <span
                  key={`${option.value}-${index}`}
                  className="block whitespace-nowrap"
                  style={{ height: EFFORT_LINE_HEIGHT, lineHeight: `${EFFORT_LINE_HEIGHT}px` }}
                >
                  {option.label}
                </span>
              ))}
            </span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

interface SessionInputOptionsProps {
  sessionId: string;
  mode: InteractionMode;
  onModeChange: (mode: InteractionMode) => void;
  isActive: boolean;
}

export function SessionInputOptions({
  sessionId,
  mode,
  onModeChange,
  isActive,
}: SessionInputOptionsProps) {
  const tool = useEntityField("sessions", sessionId, "tool") as string | undefined;
  const model = useEntityField("sessions", sessionId, "model") as string | undefined;
  const reasoningEffort = useEntityField("sessions", sessionId, "reasoningEffort") as
    | string
    | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as string | undefined;
  const isOptimistic = useEntityField("sessions", sessionId, "_optimistic") as boolean | undefined;
  const connection = useEntityField("sessions", sessionId, "connection") as
    | SessionConnection
    | null
    | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | undefined;

  const repo = useEntityField("sessions", sessionId, "repo") as { id: string } | null | undefined;
  const channelRepoId = repo?.id;

  const currentTool = tool ?? "claude_code";
  const modelOptions = getModelsForTool(currentTool);
  const currentModel = model ?? getDefaultModel(currentTool);
  const reasoningEffortOptions = getReasoningEffortsForTool(currentTool);
  const currentReasoningEffort = reasoningEffort ?? getDefaultReasoningEffort(currentTool);
  const isNotStarted = agentStatus === "not_started";

  const runtimeLabel = connection?.runtimeLabel ?? null;
  const runtimeInstanceId = connection?.runtimeInstanceId ?? null;
  const isCloudRuntime = hosting === "cloud";
  const currentRuntimeValue = isCloudRuntime
    ? CLOUD_RUNTIME_ID
    : (runtimeInstanceId ?? UNBOUND_LOCAL_RUNTIME_ID);
  const cloudEnvironmentAvailable = useCloudAgentEnvironmentAvailable(isNotStarted);
  const showCloudRuntimeOption =
    cloudEnvironmentAvailable || currentRuntimeValue === CLOUD_RUNTIME_ID;
  const autoSelectedRuntimeSessionRef = useRef<string | null>(null);

  // Fetch runtimes when not_started so user can switch
  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);
  const connectedLocalRuntimes = runtimes.filter(isAccessibleLocalRuntime);
  useEffect(() => {
    if (!isNotStarted || isOptimistic) return;
    client
      .query(AVAILABLE_RUNTIMES_QUERY, {
        tool: currentTool,
        sessionGroupId: sessionGroupId ?? null,
      })
      .toPromise()
      .then((result: { data?: Record<string, unknown> }) => {
        const data = result.data?.availableRuntimes as SessionRuntimeInstance[] | undefined;
        if (data) setRuntimes(data);
      })
      .catch((error: unknown) => {
        console.error("Failed to fetch available runtimes:", error);
      });
  }, [isNotStarted, isOptimistic, currentTool, sessionGroupId]);

  const handleToolChange = useCallback(
    async (newTool: string | null) => {
      if (!newTool || isOptimistic) return;
      const newDefault = getDefaultModel(newTool);
      const newDefaultReasoningEffort = getDefaultReasoningEffort(newTool);
      const rollback = applyOptimisticPatch("sessions", sessionId, {
        tool: newTool as CodingTool,
        model: newDefault ?? null,
        reasoningEffort: newDefaultReasoningEffort ?? null,
      });
      try {
        const result = await client
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, {
            sessionId,
            tool: newTool,
            model: newDefault,
            reasoningEffort: newDefaultReasoningEffort,
          })
          .toPromise();
        if (result.error) throw result.error;
      } catch (error) {
        rollback();
        console.error("Failed to update session tool:", error);
      }
    },
    [isOptimistic, sessionId],
  );

  const handleModelChange = useCallback(
    async (newModel: string | null) => {
      if (!newModel || isOptimistic) return;
      const rollback = applyOptimisticPatch("sessions", sessionId, { model: newModel });
      try {
        const result = await client
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, { sessionId, model: newModel })
          .toPromise();
        if (result.error) throw result.error;
      } catch (error) {
        rollback();
        console.error("Failed to update session model:", error);
      }
    },
    [isOptimistic, sessionId],
  );

  const handleReasoningEffortChange = useCallback(
    async (newReasoningEffort: string | null) => {
      if (!newReasoningEffort || isOptimistic) return;
      const rollback = applyOptimisticPatch("sessions", sessionId, {
        reasoningEffort: newReasoningEffort,
      });
      try {
        const result = await client
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, {
            sessionId,
            reasoningEffort: newReasoningEffort,
          })
          .toPromise();
        if (result.error) throw result.error;
      } catch (error) {
        rollback();
        console.error("Failed to update session reasoning effort:", error);
      }
    },
    [isOptimistic, sessionId],
  );

  const handleRuntimeChange = useCallback(
    async (value: string | null) => {
      if (isOptimistic || value === currentRuntimeValue) return;
      if (!value) return;
      if (value === UNBOUND_LOCAL_RUNTIME_ID) return;

      if (value === CLOUD_RUNTIME_ID) {
        if (!cloudEnvironmentAvailable) {
          toast.error("Cloud is not configured for this organization");
          return;
        }
        const nextConnection: SessionConnection = {
          __typename: connection?.__typename ?? "SessionConnection",
          canMove: connection?.canMove ?? true,
          canRetry: connection?.canRetry ?? true,
          lastDeliveryFailureAt: connection?.lastDeliveryFailureAt ?? null,
          lastError: connection?.lastError ?? null,
          lastSeen: connection?.lastSeen ?? null,
          retryCount: connection?.retryCount ?? 0,
          runtimeInstanceId: null,
          runtimeLabel: null,
          state: connection?.state ?? "disconnected",
        };

        const rollback = applyOptimisticPatch("sessions", sessionId, {
          hosting: "cloud",
          connection: nextConnection,
        });

        try {
          const result = await client
            .mutation(UPDATE_SESSION_CONFIG_MUTATION, { sessionId, hosting: "cloud" })
            .toPromise();
          if (result.error) throw result.error;
        } catch (error) {
          rollback();
          toast.error("Failed to update session runtime", {
            description: error instanceof Error ? error.message : undefined,
          });
          console.error("Failed to update session runtime:", error);
        }
        return;
      }

      const rt = runtimes.find((r: SessionRuntimeInstance) => r.id === value);
      const nextConnection: SessionConnection = {
        __typename: connection?.__typename ?? "SessionConnection",
        canMove: connection?.canMove ?? true,
        canRetry: connection?.canRetry ?? true,
        lastDeliveryFailureAt: connection?.lastDeliveryFailureAt ?? null,
        lastError: connection?.lastError ?? null,
        lastSeen: connection?.lastSeen ?? null,
        retryCount: connection?.retryCount ?? 0,
        runtimeInstanceId: value,
        runtimeLabel: rt?.label ?? null,
        state: connection?.state ?? "disconnected",
      };

      const rollback = applyOptimisticPatch("sessions", sessionId, {
        hosting: rt?.hostingMode ?? "local",
        connection: nextConnection,
      });

      try {
        const result = await client
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, {
            sessionId,
            hosting: "local",
            runtimeInstanceId: value,
          })
          .toPromise();
        if (result.error) throw result.error;
      } catch (error) {
        rollback();
        toast.error("Failed to update session runtime", {
          description: error instanceof Error ? error.message : undefined,
        });
        console.error("Failed to update session runtime:", error);
      }
    },
    [isOptimistic, sessionId, currentRuntimeValue, runtimes, connection, cloudEnvironmentAvailable],
  );

  useEffect(() => {
    if (
      !isNotStarted ||
      isOptimistic ||
      isCloudRuntime ||
      runtimeInstanceId ||
      currentRuntimeValue !== UNBOUND_LOCAL_RUNTIME_ID ||
      autoSelectedRuntimeSessionRef.current === sessionId
    ) {
      return;
    }

    const ownedRuntime = runtimes.find(
      (r: SessionRuntimeInstance) =>
        isAccessibleLocalRuntime(r) &&
        r.access?.isOwner &&
        (!channelRepoId || r.registeredRepoIds.includes(channelRepoId)),
    );
    if (!ownedRuntime) return;

    autoSelectedRuntimeSessionRef.current = sessionId;
    void handleRuntimeChange(ownedRuntime.id);
  }, [
    channelRepoId,
    currentRuntimeValue,
    handleRuntimeChange,
    isCloudRuntime,
    isNotStarted,
    isOptimistic,
    runtimeInstanceId,
    runtimes,
    sessionId,
  ]);

  const modeConfig = MODE_CONFIG[mode];
  const ModeIcon = modeConfig.icon;

  return (
    <div className="mt-2 flex items-center gap-1 overflow-hidden whitespace-nowrap">
      <button
        type="button"
        onClick={() => onModeChange(mode)}
        disabled={isActive || isOptimistic}
        className={cn(
          "relative flex h-7 cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg border px-2 text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          modeConfig.style,
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={mode}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1.5"
          >
            <ModeIcon size={14} className="shrink-0" />
            {modeConfig.label}
          </motion.span>
        </AnimatePresence>
      </button>
      <Select
        value={currentTool}
        onValueChange={handleToolChange}
        disabled={isActive || isOptimistic}
      >
        <SelectTrigger className="h-7 w-auto cursor-pointer gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
          <SelectValue>
            <span className="flex items-center gap-1.5">
              {currentTool === "claude_code" ? (
                <ClaudeIcon className="size-3.5" />
              ) : (
                <CodexIcon className="size-3.5" />
              )}
              {getToolLabel(currentTool)}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="claude_code">
            <span className="flex items-center gap-1.5">
              <ClaudeIcon className="size-3.5" /> Claude Code
            </span>
          </SelectItem>
          <SelectItem value="codex">
            <span className="flex items-center gap-1.5">
              <CodexIcon className="size-3.5" /> Codex
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      {modelOptions.length > 0 && (
        <Select
          value={currentModel ?? ""}
          onValueChange={handleModelChange}
          disabled={isActive || isOptimistic}
        >
          <SelectTrigger className="h-7 w-auto cursor-pointer gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
            <SelectValue>{currentModel ? getModelLabel(currentModel) : ""}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {modelOptions.map((m: { value: string; label: string }) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {reasoningEffortOptions.length > 0 && (
        <EffortCycleButton
          key={currentTool}
          effort={currentReasoningEffort ?? reasoningEffortOptions[0]?.value ?? ""}
          options={reasoningEffortOptions}
          disabled={isActive || isOptimistic}
          onChange={handleReasoningEffortChange}
        />
      )}
      {isNotStarted ? (
        <Select
          value={currentRuntimeValue}
          onValueChange={handleRuntimeChange}
          disabled={isOptimistic}
        >
          <SelectTrigger className="h-7 w-auto cursor-pointer gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
            <SelectValue>
              <span className="flex items-center gap-1">
                {currentRuntimeValue === CLOUD_RUNTIME_ID ? (
                  <>
                    <Cloud size={12} className="text-sky-400" /> Cloud
                  </>
                ) : !runtimeInstanceId ? (
                  <>
                    <AlertTriangle size={12} className="text-amber-500" /> Choose runtime
                  </>
                ) : (
                  <>
                    <Monitor size={12} className="text-green-400" /> {runtimeLabel ?? "Local"}
                  </>
                )}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {showCloudRuntimeOption ? (
              <SelectItem value={CLOUD_RUNTIME_ID} disabled={!cloudEnvironmentAvailable}>
                <span className="flex items-center gap-1.5">
                  <Cloud size={12} className="text-sky-400" /> Cloud
                </span>
              </SelectItem>
            ) : null}
            {(currentRuntimeValue === UNBOUND_LOCAL_RUNTIME_ID ||
              connectedLocalRuntimes.length === 0) && (
              <SelectItem value={UNBOUND_LOCAL_RUNTIME_ID} disabled>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <AlertTriangle size={12} className="text-amber-500" /> Choose runtime
                </span>
              </SelectItem>
            )}
            {connectedLocalRuntimes.map((r: SessionRuntimeInstance) => {
              const lacksRepo = !!channelRepoId && !r.registeredRepoIds.includes(channelRepoId);
              return (
                <SelectItem key={r.id} value={r.id} disabled={lacksRepo}>
                  <span className="flex items-center gap-1.5">
                    <Monitor size={12} className="text-green-400" /> {r.label}
                    {lacksRepo && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-500">
                        <AlertTriangle size={10} />
                        repo not linked
                      </span>
                    )}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
