import { useCallback, useMemo } from "react";
import type { SFSymbol } from "expo-symbols";
import { UPDATE_SESSION_CONFIG_MUTATION } from "@trace/client-core";
import type { CodingTool, SessionConnection } from "@trace/gql";
import { getDefaultModel, getModelLabel, getModelsForTool } from "@trace/shared";
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
  sessionId,
  tool,
}: UseSessionComposerConfigOptions) {
  const handleToolChange = useCallback(
    async (newTool: CodingTool) => {
      if (tool === newTool) return true;
      const newDefault = getDefaultModel(newTool) ?? null;
      const rollback = applyOptimisticPatch("sessions", sessionId, {
        tool: newTool,
        model: newDefault,
      });
      try {
        const result = await getClient()
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, {
            sessionId,
            tool: newTool,
            model: newDefault,
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
      if (model === newModel) return true;
      const rollback = applyOptimisticPatch("sessions", sessionId, { model: newModel });
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
    [model, sessionId],
  );

  const canChangeBridge = isNotStarted && !isOptimistic;

  const modelLabel = model ? getModelLabel(model) : "Model";
  const modelOptions = useMemo(() => getModelsForTool(currentTool), [currentTool]);
  const toolOptions = useMemo(
    () => [
      { value: "claude_code" as const, label: "Claude Code" },
      { value: "codex" as const, label: "Codex" },
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
    toolOptions,
    handleModelChange,
    handleToolChange,
    currentTool,
    model,
  };
}
