import { useCallback, useMemo } from "react";
import type { SFSymbol } from "expo-symbols";
import { UPDATE_SESSION_CONFIG_MUTATION } from "@trace/client-core";
import type { CodingTool, SessionConnection } from "@trace/gql";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  getModelLabel,
  getModelSelectionOptionsForTool,
  getReasoningEffortLabel,
  getReasoningEffortsForTool,
} from "@trace/shared";
import { haptic } from "@/lib/haptics";
import { applyOptimisticPatch } from "@/lib/optimisticEntity";
import { getClient } from "@/lib/urql";

interface UseSessionComposerConfigOptions {
  connection: SessionConnection | null | undefined;
  currentTool: CodingTool;
  hosting: string | null | undefined;
  isNotStarted: boolean;
  isOptimistic: unknown;
  model: string | null | undefined;
  modelSelectionMode?: string | null | undefined;
  autoSelectedModel?: string | null | undefined;
  reasoningEffort?: string | null | undefined;
  sessionId: string;
  tool: string | null | undefined;
}

export function useSessionComposerConfig({
  connection,
  currentTool,
  hosting,
  isNotStarted,
  isOptimistic,
  model,
  modelSelectionMode,
  autoSelectedModel,
  reasoningEffort,
  sessionId,
  tool,
}: UseSessionComposerConfigOptions) {
  const handleToolChange = useCallback(
    async (newTool: CodingTool) => {
      if (tool === newTool) return true;
      const newDefault = getDefaultModel(newTool) ?? null;
      const newDefaultReasoningEffort = getDefaultReasoningEffort(newTool) ?? null;
      const rollback = applyOptimisticPatch("sessions", sessionId, {
        tool: newTool,
        model: newDefault,
        modelSelectionMode: "manual",
        autoSelectedModel: null,
        reasoningEffort: newDefaultReasoningEffort,
      });
      try {
        const result = await getClient()
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, {
            sessionId,
            tool: newTool,
            model: newDefault,
            reasoningEffort: newDefaultReasoningEffort,
          })
          .toPromise();
        if (result.error) throw result.error;
        return true;
      } catch (err) {
        rollback();
        void haptic.error();
        console.warn("[updateSessionConfig] tool change failed", err);
        return false;
      }
    },
    [sessionId, tool],
  );

  const handleModelChange = useCallback(
    async (newModel: string) => {
      if (model === newModel && modelSelectionMode !== "auto") return true;
      const rollback = applyOptimisticPatch("sessions", sessionId, {
        ...(newModel === "auto" ? {} : { model: newModel }),
        modelSelectionMode: newModel === "auto" ? "auto" : "manual",
        autoSelectedModel: null,
      });
      try {
        const result = await getClient()
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, { sessionId, model: newModel })
          .toPromise();
        if (result.error) throw result.error;
        return true;
      } catch (err) {
        rollback();
        void haptic.error();
        console.warn("[updateSessionConfig] model change failed", err);
        return false;
      }
    },
    [model, modelSelectionMode, sessionId],
  );

  const handleReasoningEffortChange = useCallback(
    async (newReasoningEffort: string) => {
      if (reasoningEffort === newReasoningEffort) return true;
      const rollback = applyOptimisticPatch("sessions", sessionId, {
        reasoningEffort: newReasoningEffort,
      });
      try {
        const result = await getClient()
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, {
            sessionId,
            reasoningEffort: newReasoningEffort,
          })
          .toPromise();
        if (result.error) throw result.error;
        return true;
      } catch (err) {
        rollback();
        void haptic.error();
        console.warn("[updateSessionConfig] reasoning effort change failed", err);
        return false;
      }
    },
    [reasoningEffort, sessionId],
  );

  const canChangeBridge = isNotStarted && !isOptimistic;

  const modelLabel =
    modelSelectionMode === "auto"
      ? autoSelectedModel
        ? `Auto: ${getModelLabel(autoSelectedModel)}`
        : "Choosing model..."
      : model
        ? getModelLabel(model)
        : "Model";
  const modelOptions = useMemo(() => getModelSelectionOptionsForTool(currentTool), [currentTool]);
  const reasoningEffortOptions = useMemo(
    () => getReasoningEffortsForTool(currentTool),
    [currentTool],
  );
  const effectiveReasoningEffort = reasoningEffort ?? getDefaultReasoningEffort(currentTool);
  const reasoningEffortLabel = effectiveReasoningEffort
    ? getReasoningEffortLabel(effectiveReasoningEffort)
    : "Effort";
  const toolOptions = useMemo(
    () => [
      { value: "claude_code" as const, label: "Claude Code" },
      { value: "codex" as const, label: "Codex" },
      { value: "pi" as const, label: "Pi" },
    ],
    [],
  );

  const bridgeIcon: SFSymbol = hosting === "cloud" ? "cloud" : "laptopcomputer";
  const bridgeLabel = hosting === "cloud" ? "Cloud" : (connection?.runtimeLabel ?? "Local");

  return {
    bridgeIcon,
    bridgeLabel,
    canChangeBridge,
    modelLabel,
    modelOptions,
    reasoningEffortLabel,
    reasoningEffortOptions,
    toolOptions,
    handleModelChange,
    handleReasoningEffortChange,
    handleToolChange,
    currentTool,
    model: modelSelectionMode === "auto" ? "auto" : model,
    reasoningEffort: effectiveReasoningEffort,
  };
}
