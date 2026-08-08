import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Cloud, Monitor } from "lucide-react";
import { toast } from "sonner";
import { gql } from "@urql/core";
import type { DesignSystem, SessionConnection, SessionRuntimeInstance } from "@trace/gql";
import type { ModelOption } from "@trace/shared";
import {
  hasSelectedSessionGroupRuntime,
  useAuthStore,
  useEntityField,
  useEntityStore,
} from "@trace/client-core";
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
import {
  CREATE_DESIGN_SYSTEM,
  DesignSystemCombobox,
  TRACE_DEFAULT_DESIGN_SYSTEM,
} from "../design-system/DesignSystemCombobox";
import { useCommandPaletteStore } from "../../stores/command-palette";

const DESIGN_SYSTEMS_QUERY = gql`
  query DesignComposerOptions($organizationId: ID!) {
    designSystems(organizationId: $organizationId) {
      id
      name
      status
      archivedAt
      latestCommitArtifact {
        id
        status
        packageValid
        validationSummary
      }
      commitArtifactStatus
      publishStatus
      activeVersionId
      activeVersion {
        id
        version
      }
      sourceRepo {
        id
        name
      }
    }
  }
`;

const UNBOUND_LOCAL_RUNTIME_ID = "__unbound_local__";
const CLOUD_RUNTIME_ID = "__cloud__";

const EFFORT_LINE_HEIGHT = 16;

function catalogModels(catalog: unknown, tool: string): ModelOption[] | undefined {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) return undefined;
  const entries = (catalog as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return undefined;
  const entry = entries.find((item) =>
    !!item && typeof item === "object" && (item as { tool?: unknown }).tool === tool,
  ) as { availability?: unknown; models?: unknown } | undefined;
  if (entry?.availability !== "ready" || !Array.isArray(entry.models)) return undefined;
  const models = entry.models.filter((model): model is string => typeof model === "string");
  return models.length ? models.map((value) => ({ value, label: value })) : undefined;
}

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

interface ComposerInputOptionsProps {
  mode: InteractionMode;
  tool: ToolOptionValue;
  model: string | null | undefined;
  reasoningEffort: string | null | undefined;
  reasoningEffortOptions: readonly ReasoningEffortOption[];
  runtimeModels?: readonly ModelOption[];
  disabled?: boolean;
  compact?: boolean;
  showMode?: boolean;
  alwaysExpandToolModel?: boolean;
  afterTool?: ReactNode;
  afterEffort?: ReactNode;
  onModeChange: (mode: InteractionMode) => void;
  onToolChange: (tool: ToolOptionValue) => Promise<void> | void;
  onModelChange: (model: string) => Promise<void> | void;
  onReasoningEffortChange: (effort: string) => Promise<void> | void;
}

export function ComposerInputOptions({
  mode,
  tool,
  model,
  reasoningEffort,
  reasoningEffortOptions,
  runtimeModels,
  disabled,
  compact = false,
  showMode = true,
  alwaysExpandToolModel = false,
  afterTool,
  afterEffort,
  onModeChange,
  onToolChange,
  onModelChange,
  onReasoningEffortChange,
}: ComposerInputOptionsProps) {
  const modeConfig = MODE_CONFIG[mode];
  const ModeIcon = modeConfig.icon;

  return (
    <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
      {showMode ? (
        <button
          type="button"
          onClick={() => onModeChange(mode)}
          disabled={disabled}
          aria-label={`${modeConfig.label} mode`}
          title={`${modeConfig.label} mode`}
          className={cn(
            "relative flex h-7 cursor-pointer items-center gap-1.5 overflow-hidden rounded-lg border text-[11px] font-medium transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
            compact ? "w-7 justify-center px-0" : "px-2",
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
              {compact ? null : modeConfig.label}
            </motion.span>
          </AnimatePresence>
        </button>
      ) : null}
      <ToolModelPicker
        tool={tool}
        model={model}
        reasoningEffort={reasoningEffort}
        reasoningEffortOptions={reasoningEffortOptions}
        runtimeModels={runtimeModels}
        disabled={disabled}
        compact={compact}
        alwaysExpanded={alwaysExpandToolModel}
        onToolChange={onToolChange}
        onModelChange={onModelChange}
        onReasoningEffortChange={onReasoningEffortChange}
      />
      {afterTool}
      {!compact && reasoningEffortOptions.length > 0 && (
        <div className="hidden @lg:block">
          <EffortCycleButton
            key={tool}
            effort={reasoningEffort ?? reasoningEffortOptions[0]?.value ?? ""}
            options={reasoningEffortOptions}
            disabled={disabled}
            onChange={onReasoningEffortChange}
          />
        </div>
      )}
      {afterEffort}
    </div>
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
  const workdir = useEntityField("sessions", sessionId, "workdir") as string | null | undefined;
  const sessionGroupId = useEntityField("sessions", sessionId, "sessionGroupId") as
    | string
    | undefined;
  const sessionGroupKind = useEntityField("sessionGroups", sessionGroupId ?? "", "kind") as
    | string
    | null
    | undefined;
  const selectedDesignSystemVersionId = useEntityField(
    "sessionGroups",
    sessionGroupId ?? "",
    "designSystemVersionId",
  ) as string | null | undefined;
  const activeOrgId = useAuthStore((state) => state.activeOrgId);
  const designSystemsById = useEntityStore((state) => state.designSystems);
  const designSystems = useMemo(() => Object.values(designSystemsById), [designSystemsById]);
  const upsertMany = useEntityStore((state) => state.upsertMany);
  const openGeneratedProjectDialog = useCommandPaletteStore(
    (state) => state.openGeneratedProjectDialog,
  );
  const groupConnection = useEntityField("sessionGroups", sessionGroupId ?? "", "connection") as
    | SessionConnection
    | null
    | undefined;
  const groupWorkdir = useEntityField("sessionGroups", sessionGroupId ?? "", "workdir") as
    | string
    | null
    | undefined;

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
  const isDesignSession = sessionGroupKind === "design";
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
  const runtimeCatalog = runtimes.find((runtime) => runtime.id === connection?.runtimeInstanceId)?.providerCatalog;
  const runtimeModels = catalogModels(runtimeCatalog, currentTool);

  const handleDesignSystemChange = useCallback(
    async (value: string) => {
      if (!isDesignSession || !isNotStarted || isOptimistic) return;
      if (value === CREATE_DESIGN_SYSTEM) {
        openGeneratedProjectDialog("design-system");
        return;
      }
      const designSystemVersionId = value === TRACE_DEFAULT_DESIGN_SYSTEM ? null : value;
      const rollback = applyOptimisticPatch("sessionGroups", sessionGroupId ?? "", {
        designSystemVersionId,
      });
      try {
        const result = await client
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, {
            sessionId,
            designSystemVersionId,
          })
          .toPromise();
        if (result.error) throw result.error;
      } catch (error) {
        rollback();
        toast.error("Failed to update design library", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [
      isDesignSession,
      isNotStarted,
      isOptimistic,
      openGeneratedProjectDialog,
      sessionGroupId,
      sessionId,
    ],
  );

  useEffect(() => {
    if (!activeOrgId || !isDesignSession || !isNotStarted) return;
    let active = true;
    void client
      .query(
        DESIGN_SYSTEMS_QUERY,
        { organizationId: activeOrgId },
        { requestPolicy: "network-only" },
      )
      .toPromise()
      .then((result) => {
        if (!active || result.error) return;
        upsertMany("designSystems", (result.data?.designSystems ?? []) as DesignSystem[]);
      });
    return () => {
      active = false;
    };
  }, [activeOrgId, isDesignSession, isNotStarted, upsertMany]);

  const fetchAvailableRuntimes = useCallback(() => {
    // Even when a session's runtime is locked, its catalog drives the model
    // picker. Runtime mutability only controls the selector UI below.
    if (isOptimistic) return Promise.resolve();
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
  }, [isOptimistic, currentTool, sessionGroupId]);

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

  return (
    <ComposerInputOptions
      mode={mode}
      tool={currentTool}
      model={currentModel}
      reasoningEffort={currentReasoningEffort}
      reasoningEffortOptions={reasoningEffortOptions}
      runtimeModels={runtimeModels}
      disabled={isActive || isOptimistic}
      onModeChange={onModeChange}
      onToolChange={handleToolChange}
      onModelChange={handleModelChange}
      onReasoningEffortChange={handleReasoningEffortChange}
      afterTool={
        isDesignSession ? (
          <DesignSystemCombobox
            systems={designSystems}
            value={selectedDesignSystemVersionId ?? TRACE_DEFAULT_DESIGN_SYSTEM}
            disabled={isOptimistic || !isNotStarted}
            onValueChange={(value) => void handleDesignSystemChange(value)}
          />
        ) : null
      }
      afterEffort={
        canChangeRuntime ? (
          <Select
            value={currentRuntimeValue}
            onValueChange={handleRuntimeChange}
            onOpenChange={(open) => {
              if (open) void fetchAvailableRuntimes();
            }}
            disabled={isOptimistic}
          >
            <SelectTrigger
              size="sm"
              className="w-auto border-transparent bg-transparent hover:border-transparent hover:bg-white/10 data-popup-open:border-transparent"
              title={
                currentRuntimeValue === CLOUD_RUNTIME_ID
                  ? "Cloud"
                  : (runtimeLabel ?? (runtimeInstanceId ? "Local" : undefined))
              }
            >
              <SelectValue>
                <span className="flex items-center gap-2">
                  {currentRuntimeValue === CLOUD_RUNTIME_ID ? (
                    <>
                      <Cloud /> Cloud
                    </>
                  ) : !runtimeInstanceId ? (
                    <>
                      <AlertTriangle /> Choose runtime
                    </>
                  ) : (
                    <>
                      <Monitor /> {runtimeLabel ?? "Local"}
                    </>
                  )}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-56">
              {showCloudRuntimeOption ? (
                <SelectItem
                  value={CLOUD_RUNTIME_ID}
                  disabled={!cloudEnvironmentAvailable || !!cloudDisabledReason}
                >
                  <span className="flex items-center gap-2">
                    <Cloud /> Cloud
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
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <AlertTriangle /> Choose runtime
                  </span>
                </SelectItem>
              )}
              {connectedLocalRuntimes.map((r: SessionRuntimeInstance) => {
                const lacksRepo = !!channelRepoId && !r.registeredRepoIds.includes(channelRepoId);
                return (
                  <SelectItem key={r.id} value={r.id} disabled={lacksRepo}>
                    <span className="flex items-center gap-2">
                      <Monitor /> {r.label}
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
        ) : null
      }
    />
  );
}
