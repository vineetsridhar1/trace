import { useCallback, useEffect, useMemo, useState } from "react";
import { AVAILABLE_RUNTIMES_QUERY, UPDATE_SESSION_CONFIG_MUTATION } from "@trace/client-core";
import type {
  CodingTool,
  HostingMode,
  SessionConnection,
  SessionRuntimeInstance,
} from "@trace/gql";
import { getDefaultModel, getModelLabel, getModelsForTool } from "@trace/shared";
import { haptic } from "@/lib/haptics";
import { applyOptimisticPatch } from "@/lib/optimisticEntity";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";
import type { ComposerMorphPillItem } from "../ComposerMorphPill";
import { CLOUD_RUNTIME_ID } from "./constants";

interface UseSessionComposerConfigOptions {
  canInteract: boolean;
  channelRepoId: string | undefined;
  connection: SessionConnection | null | undefined;
  currentTool: CodingTool;
  hosting: string | null | undefined;
  isNotStarted: boolean;
  isOptimistic: unknown;
  model: string | null | undefined;
  sessionGroupId: string | null | undefined;
  sessionId: string;
  tool: string | null | undefined;
}

export function useSessionComposerConfig({
  canInteract,
  channelRepoId,
  connection,
  currentTool,
  hosting,
  isNotStarted,
  isOptimistic,
  model,
  sessionGroupId,
  sessionId,
  tool,
}: UseSessionComposerConfigOptions) {
  const theme = useTheme();
  const [runtimes, setRuntimes] = useState<SessionRuntimeInstance[]>([]);

  const handleToolChange = useCallback(
    async (newTool: CodingTool) => {
      if (tool === newTool) return;
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
      } catch (err) {
        rollback();
        void haptic.error();
        console.warn("[updateSessionConfig] tool change failed", err);
      }
    },
    [sessionId, tool],
  );

  const handleModelChange = useCallback(
    async (newModel: string) => {
      if (model === newModel) return;
      const rollback = applyOptimisticPatch("sessions", sessionId, { model: newModel });
      try {
        const result = await getClient()
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, { sessionId, model: newModel })
          .toPromise();
        if (result.error) throw result.error;
      } catch (err) {
        rollback();
        void haptic.error();
        console.warn("[updateSessionConfig] model change failed", err);
      }
    },
    [model, sessionId],
  );

  const canChangeBridge = isNotStarted && !isOptimistic;
  const runtimeInstanceId = connection?.runtimeInstanceId ?? null;
  const currentRuntimeValue =
    hosting === "cloud" ? CLOUD_RUNTIME_ID : (runtimeInstanceId ?? CLOUD_RUNTIME_ID);

  useEffect(() => {
    if (!canChangeBridge) return;
    let cancelled = false;
    getClient()
      .query(AVAILABLE_RUNTIMES_QUERY, {
        tool: currentTool,
        sessionGroupId: sessionGroupId ?? null,
      })
      .toPromise()
      .then((result) => {
        if (cancelled) return;
        const data = result.data?.availableRuntimes as
          | SessionRuntimeInstance[]
          | undefined;
        if (data) setRuntimes(data);
      })
      .catch((err) => {
        console.warn("[availableRuntimes] failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [canChangeBridge, currentTool, sessionGroupId]);

  const handleBridgeChange = useCallback(
    async (value: string) => {
      if (!canChangeBridge || value === currentRuntimeValue) return;
      const newIsCloud = value === CLOUD_RUNTIME_ID;
      const runtime = runtimes.find((entry) => entry.id === value);
      const nextHosting: HostingMode = newIsCloud
        ? "cloud"
        : (runtime?.hostingMode ?? "local");
      const nextConnection: SessionConnection = {
        __typename: connection?.__typename ?? "SessionConnection",
        autoRetryable: connection?.autoRetryable ?? null,
        canMove: connection?.canMove ?? true,
        canRetry: connection?.canRetry ?? true,
        lastDeliveryFailureAt: connection?.lastDeliveryFailureAt ?? null,
        lastError: connection?.lastError ?? null,
        lastSeen: connection?.lastSeen ?? null,
        retryCount: connection?.retryCount ?? 0,
        runtimeInstanceId: newIsCloud ? null : value,
        runtimeLabel: newIsCloud ? null : (runtime?.label ?? null),
        state: connection?.state ?? "disconnected",
      };
      const rollback = applyOptimisticPatch("sessions", sessionId, {
        hosting: nextHosting,
        connection: nextConnection,
      });
      try {
        const result = await getClient()
          .mutation(UPDATE_SESSION_CONFIG_MUTATION, {
            sessionId,
            hosting: newIsCloud ? "cloud" : undefined,
            runtimeInstanceId: newIsCloud ? undefined : value,
          })
          .toPromise();
        if (result.error) throw result.error;
      } catch (err) {
        rollback();
        void haptic.error();
        console.warn("[updateSessionConfig] bridge change failed", err);
      }
    },
    [canChangeBridge, connection, currentRuntimeValue, runtimes, sessionId],
  );

  const modelLabel = model ? getModelLabel(model) : "Model";
  const modelOptions = useMemo(() => getModelsForTool(currentTool), [currentTool]);
  const toolHeaderItems = useMemo<ComposerMorphPillItem[]>(
    () => [
      {
        key: "tool:claude_code",
        label: "Claude Code",
        selected: currentTool === "claude_code",
        disabled: !canInteract,
        onPress: () => void handleToolChange("claude_code"),
      },
      {
        key: "tool:codex",
        label: "Codex",
        selected: currentTool === "codex",
        disabled: !canInteract,
        onPress: () => void handleToolChange("codex"),
      },
    ],
    [canInteract, currentTool, handleToolChange],
  );

  const modelItems = useMemo<ComposerMorphPillItem[]>(
    () =>
      modelOptions.map((option) => ({
        key: `model:${option.value}`,
        label: option.label,
        selected: model === option.value,
        disabled: !canInteract,
        onPress: () => void handleModelChange(option.value),
      })),
    [canInteract, handleModelChange, model, modelOptions],
  );

  const bridgeItems = useMemo<ComposerMorphPillItem[]>(() => {
    const items: ComposerMorphPillItem[] = [
      {
        key: `bridge:${CLOUD_RUNTIME_ID}`,
        label: "Cloud",
        systemIcon: "cloud",
        selected: hosting === "cloud",
        onPress: () => void handleBridgeChange(CLOUD_RUNTIME_ID),
      },
    ];

    for (const runtime of runtimes) {
      if (runtime.hostingMode !== "local" || !runtime.connected) continue;
      const lacksRepo = channelRepoId
        ? !runtime.registeredRepoIds.includes(channelRepoId)
        : false;
      items.push({
        key: `bridge:${runtime.id}`,
        label: runtime.label,
        systemIcon: "laptopcomputer",
        trailingIcon: lacksRepo ? "exclamationmark.triangle.fill" : undefined,
        trailingIconTint: lacksRepo ? theme.colors.warning : undefined,
        selected: runtimeInstanceId === runtime.id,
        disabled: lacksRepo,
        onPress: () => void handleBridgeChange(runtime.id),
      });
    }

    return items;
  }, [
    channelRepoId,
    handleBridgeChange,
    hosting,
    runtimeInstanceId,
    runtimes,
    theme.colors.warning,
  ]);

  const bridgeIcon = hosting === "cloud" ? "cloud" : "laptopcomputer";
  const bridgeLabel =
    hosting === "cloud" ? "Cloud" : (connection?.runtimeLabel ?? "Local");

  return {
    bridgeIcon,
    bridgeItems,
    bridgeLabel,
    canChangeBridge,
    modelItems,
    modelLabel,
    toolHeaderItems,
  };
}
