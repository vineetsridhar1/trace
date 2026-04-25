import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Cloud, Monitor } from "lucide-react";
import type { CodingTool, SessionConnection, SessionRuntimeInstance } from "@trace/gql";
import { useEntityField } from "@trace/client-core";
import { client } from "../../lib/urql";
import { applyOptimisticPatch } from "../../lib/optimistic-entity";
import { AVAILABLE_RUNTIMES_QUERY, UPDATE_SESSION_CONFIG_MUTATION } from "@trace/client-core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { type InteractionMode, MODE_CONFIG } from "./interactionModes";
import { getModelsForTool, getDefaultModel, getModelLabel } from "./modelOptions";
import { CLOUD_RUNTIME_ID } from "./RuntimeSelector";
import { ClaudeIcon, CodexIcon } from "../ui/tool-icons";
import { cn } from "../../lib/utils";
import { isLocalMode } from "../../lib/runtime-mode";

const UNBOUND_LOCAL_RUNTIME_ID = "__unbound_local__";

const TOOL_LABELS: Record<string, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
};

function getToolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool;
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
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as string | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | undefined;
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
  const isNotStarted = agentStatus === "not_started";

  const runtimeLabel = connection?.runtimeLabel ?? null;
  const runtimeInstanceId = connection?.runtimeInstanceId ?? null;
  const isCloud = !isLocalMode && hosting === "cloud";
  const currentRuntimeValue = isLocalMode
    ? (runtimeInstanceId ?? UNBOUND_LOCAL_RUNTIME_ID)
    : (isCloud ? CLOUD_RUNTIME_ID : (runtimeInstanceId ?? CLOUD_RUNTIME_ID));

  // Fetch runtimes when not_started so user can switch
  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);
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
      const rollback = applyOptimisticPatch("sessions", sessionId, {
        tool: newTool as CodingTool,
        model: newDefault ?? null,
      });
      try {
        const result = await client
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, { sessionId, tool: newTool, model: newDefault })
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

  const handleRuntimeChange = useCallback(
    async (value: string | null) => {
      if (isOptimistic || value === currentRuntimeValue) return;
      if (!value) return;
      if (isLocalMode && value === UNBOUND_LOCAL_RUNTIME_ID) return;

      const newIsCloud = !isLocalMode && value === CLOUD_RUNTIME_ID;
      const rt = runtimes.find((r: SessionRuntimeInstance) => r.id === value);
      const nextConnection: SessionConnection = {
        __typename: connection?.__typename ?? "SessionConnection",
        canMove: connection?.canMove ?? true,
        canRetry: connection?.canRetry ?? true,
        lastDeliveryFailureAt: connection?.lastDeliveryFailureAt ?? null,
        lastError: connection?.lastError ?? null,
        lastSeen: connection?.lastSeen ?? null,
        retryCount: connection?.retryCount ?? 0,
        runtimeInstanceId: newIsCloud ? null : value,
        runtimeLabel: newIsCloud ? null : (rt?.label ?? null),
        state: connection?.state ?? "disconnected",
      };

      const rollback = applyOptimisticPatch("sessions", sessionId, {
        hosting: newIsCloud ? "cloud" : (rt?.hostingMode ?? "local"),
        connection: nextConnection,
      });

      try {
        const result = await client
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, {
            sessionId,
            hosting: newIsCloud ? "cloud" : (isLocalMode ? "local" : undefined),
            runtimeInstanceId: newIsCloud ? undefined : value,
          })
          .toPromise();
        if (result.error) throw result.error;
      } catch (error) {
        rollback();
        console.error("Failed to update session runtime:", error);
      }
    },
    [isOptimistic, sessionId, currentRuntimeValue, runtimes, connection],
  );

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
      {isNotStarted ? (
        <Select
          value={currentRuntimeValue}
          onValueChange={handleRuntimeChange}
          disabled={isOptimistic}
        >
          <SelectTrigger className="h-7 w-auto cursor-pointer gap-1.5 border-none bg-transparent px-2 text-[11px] text-muted-foreground hover:text-foreground focus:ring-0">
            <SelectValue>
              <span className="flex items-center gap-1">
                {isCloud ? (
                  <>
                    <Cloud size={12} className="text-blue-400" /> Cloud
                  </>
                ) : !runtimeInstanceId ? (
                  <>
                    <AlertTriangle size={12} className="text-amber-500" /> No local runtime
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
            {!isLocalMode && (
              <SelectItem value={CLOUD_RUNTIME_ID}>
                <span className="flex items-center gap-1.5">
                  <Cloud size={12} className="text-blue-400" /> Cloud
                </span>
              </SelectItem>
            )}
            {isLocalMode && !runtimeInstanceId && (
              <SelectItem value={UNBOUND_LOCAL_RUNTIME_ID} disabled>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <AlertTriangle size={12} className="text-amber-500" /> No local runtime
                </span>
              </SelectItem>
            )}
            {runtimes
              .filter((r: SessionRuntimeInstance) => r.hostingMode === "local" && r.connected)
              .map((r: SessionRuntimeInstance) => {
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
