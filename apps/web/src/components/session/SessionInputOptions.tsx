import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Cloud, Monitor } from "lucide-react";
import { toast } from "sonner";
import type { SessionConnection, SessionRuntimeInstance } from "@trace/gql";
import { hasSelectedSessionGroupRuntime, useEntityField } from "@trace/client-core";
import { client } from "../../lib/urql";
import { applyOptimisticPatch } from "../../lib/optimistic-entity";
import { AVAILABLE_RUNTIMES_QUERY, UPDATE_SESSION_CONFIG_MUTATION } from "@trace/client-core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { DisabledReasonHint } from "../ui/DisabledReasonHint";
import { type InteractionMode, MODE_CONFIG } from "./interactionModes";
import {
  getDefaultModel,
  getReasoningEffortsForTool,
  getDefaultReasoningEffort,
  getReasoningEffortLabel,
  type ReasoningEffortOption,
} from "./modelOptions";
import { ToolModelPicker } from "./ToolModelPicker";
import { normalizeTool, type ToolOptionValue } from "./picker/pickerShared";
import { cn } from "../../lib/utils";
import { useCloudAgentEnvironmentAvailable } from "../../hooks/useCloudAgentEnvironmentAvailable";
import { isAccessibleLocalRuntime } from "../../lib/bridge-access";
import { CLOUD_REPO_REMOTE_REQUIRED, repoRemoteKnownMissing } from "../../lib/repo-capabilities";
import { isGeneratedProjectKind } from "./sessionEmptyState";

const UNBOUND_LOCAL_RUNTIME_ID = "__unbound_local__";
const CLOUD_RUNTIME_ID = "__cloud__";

const EFFORT_LINE_HEIGHT = 16;

function EffortDots({ index, total }: { index: number; total: number }) {
  return (
    <span className="flex items-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "block h-[3px] w-[3px] rounded-full transition-opacity duration-150",
            i <= index ? "bg-current opacity-100" : "bg-current opacity-30",
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
  onChange: (effort: string) => Promise<void> | void;
}) {
  const [pendingEffort, setPendingEffort] = useState<string | null>(null);
  const displayedEffort = pendingEffort ?? effort;
  const currentIndex = options.findIndex((option) => option.value === displayedEffort);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const currentOption = options[safeIndex];
  const currentLabel = currentOption?.label ?? getReasoningEffortLabel(displayedEffort);
  const nextOption = options[(safeIndex + 1) % options.length];
  const isPending = pendingEffort !== null;

  return (
    <button
      type="button"
      onClick={async () => {
        if (!nextOption || isPending) return;
        setPendingEffort(nextOption.value);
        try {
          await onChange(nextOption.value);
        } finally {
          setPendingEffort(null);
        }
      }}
      disabled={disabled || isPending}
      aria-label={`Reasoning effort: ${currentLabel}. Click to cycle.`}
      className={cn(
        "flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border-none bg-transparent px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <EffortDots index={safeIndex} total={options.length} />
      <span
        className="relative block min-w-[4.25rem] overflow-hidden text-left"
        style={{ height: EFFORT_LINE_HEIGHT }}
      >
        <span
          key={currentOption?.value ?? displayedEffort}
          className="block transition-opacity duration-150 ease-out"
          style={{ height: EFFORT_LINE_HEIGHT, lineHeight: `${EFFORT_LINE_HEIGHT}px` }}
        >
          {currentLabel}
        </span>
      </span>
    </button>
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
  const workdir = useEntityField("sessions", sessionId, "workdir") as
    | string
    | null
    | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | undefined;
  const sessionGroupKind = useEntityField("sessionGroups", sessionGroupId ?? "", "kind") as
    | string
    | null
    | undefined;
  const groupConnection = useEntityField(
    "sessionGroups",
    sessionGroupId ?? "",
    "connection",
  ) as SessionConnection | null | undefined;
  const groupWorkdir = useEntityField(
    "sessionGroups",
    sessionGroupId ?? "",
    "workdir",
  ) as string | null | undefined;

  const repo = useEntityField("sessions", sessionId, "repo") as
    | { id: string; remoteUrl?: string | null }
    | null
    | undefined;
  const channelRepoId = repo?.id;
  const cloudDisabledReason = repoRemoteKnownMissing(repo) ? CLOUD_REPO_REMOTE_REQUIRED : null;

  const currentTool: ToolOptionValue = normalizeTool(tool ?? "claude_code");
  const currentModel = model ?? getDefaultModel(currentTool);
  const reasoningEffortOptions = getReasoningEffortsForTool(currentTool);
  const currentReasoningEffort = reasoningEffort ?? getDefaultReasoningEffort(currentTool);
  const isNotStarted = agentStatus === "not_started";
  const runtimeLocked = isGeneratedProjectKind(sessionGroupKind);
  const groupHasSelectedRuntime = hasSelectedSessionGroupRuntime(
    groupConnection === undefined ? connection : groupConnection,
    groupWorkdir === undefined ? workdir : groupWorkdir,
  );
  const canChangeRuntime = isNotStarted && !runtimeLocked && !groupHasSelectedRuntime;

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

  // Runtime selection is only available while choosing the first bridge for
  // a new, unbound group. Sibling sessions inherit the group's bridge.
  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);
  const connectedLocalRuntimes = runtimes.filter(isAccessibleLocalRuntime);
  const fetchAvailableRuntimes = useCallback(() => {
    if (!canChangeRuntime || isOptimistic) return Promise.resolve();
    return client
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
  }, [canChangeRuntime, isOptimistic, currentTool, sessionGroupId]);

  useEffect(() => {
    void fetchAvailableRuntimes();
  }, [fetchAvailableRuntimes]);

  const handleToolChange = useCallback(
    async (newTool: ToolOptionValue) => {
      if (isOptimistic) return;
      const newDefault = getDefaultModel(newTool);
      const newDefaultReasoningEffort = getDefaultReasoningEffort(newTool);
      const rollback = applyOptimisticPatch("sessions", sessionId, {
        tool: newTool,
        model: newDefault ?? null,
        reasoningEffort: newDefaultReasoningEffort ?? null,
      });
      try {
        const result = await client
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, {
            sessionId,
            tool: newTool,
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
    async (newModel: string) => {
      if (isOptimistic) return;
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
      if (!canChangeRuntime || isOptimistic || value === currentRuntimeValue) return;
      if (!value) return;
      if (value === UNBOUND_LOCAL_RUNTIME_ID) return;

      if (value === CLOUD_RUNTIME_ID) {
        if (cloudDisabledReason) {
          toast.error("Cloud is unavailable for this repo", { description: cloudDisabledReason });
          return;
        }
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
    [
      isOptimistic,
      canChangeRuntime,
      sessionId,
      currentRuntimeValue,
      runtimes,
      connection,
      cloudDisabledReason,
      cloudEnvironmentAvailable,
    ],
  );

  useEffect(() => {
    if (
      !isNotStarted ||
      !canChangeRuntime ||
      isOptimistic ||
      runtimeLocked ||
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
    canChangeRuntime,
    currentRuntimeValue,
    handleRuntimeChange,
    isCloudRuntime,
    isNotStarted,
    isOptimistic,
    runtimeInstanceId,
    runtimeLocked,
    runtimes,
    sessionId,
  ]);

  const modeConfig = MODE_CONFIG[mode];
  const ModeIcon = modeConfig.icon;

  return (
    <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
      <button
        type="button"
        onClick={() => onModeChange(mode)}
        disabled={isActive || isOptimistic}
        className={cn(
          "relative flex h-7 cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg border px-2 text-[11px] font-medium transition-colors hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed",
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
      <ToolModelPicker
        tool={currentTool}
        model={currentModel}
        reasoningEffort={currentReasoningEffort}
        reasoningEffortOptions={reasoningEffortOptions}
        disabled={isActive || isOptimistic}
        onToolChange={handleToolChange}
        onModelChange={handleModelChange}
        onReasoningEffortChange={handleReasoningEffortChange}
      />
      {reasoningEffortOptions.length > 0 && (
        <div className="hidden lg:block">
          <EffortCycleButton
            key={currentTool}
            effort={currentReasoningEffort ?? reasoningEffortOptions[0]?.value ?? ""}
            options={reasoningEffortOptions}
            disabled={isActive || isOptimistic}
            onChange={handleReasoningEffortChange}
          />
        </div>
      )}
      {canChangeRuntime ? (
        <Select
          value={currentRuntimeValue}
          onValueChange={handleRuntimeChange}
          onOpenChange={(open) => {
            if (open) void fetchAvailableRuntimes();
          }}
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
              <SelectItem
                value={CLOUD_RUNTIME_ID}
                disabled={!cloudEnvironmentAvailable || !!cloudDisabledReason}
              >
                <span className="flex items-center gap-1.5">
                  <Cloud size={12} className="text-sky-400" /> Cloud
                  {cloudDisabledReason && (
                    <DisabledReasonHint message={cloudDisabledReason}>
                      remote required
                    </DisabledReasonHint>
                  )}
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
                      <DisabledReasonHint message="This local runtime does not have this repo linked.">
                        repo not linked
                      </DisabledReasonHint>
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
