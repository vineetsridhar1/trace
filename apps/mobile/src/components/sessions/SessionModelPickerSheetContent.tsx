import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useEntityField } from "@trace/client-core";
import type { CodingTool, SessionConnection } from "@trace/gql";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  getModelProviderGroupsForTool,
} from "@trace/shared";
import { ListRow, Text } from "@/components/design-system";
import { useTheme } from "@/theme";
import { useSessionComposerConfig } from "./session-input-composer/useSessionComposerConfig";

interface SessionModelPickerSheetContentProps {
  sessionId: string;
  onClose?: () => void;
  onSelectModel?: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="footnote" color="mutedForeground" style={styles.sectionTitle}>
        {title}
      </Text>
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surfaceElevated,
            borderColor: theme.colors.borderMuted,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export function SessionModelPickerSheetContent({
  sessionId,
  onClose,
  onSelectModel,
}: SessionModelPickerSheetContentProps) {
  const theme = useTheme();
  const [pendingTool, setPendingTool] = useState<CodingTool | null>(null);
  const [pendingModel, setPendingModel] = useState<string | null>(null);
  const [pendingReasoningEffort, setPendingReasoningEffort] = useState<string | null>(null);

  const tool = useEntityField("sessions", sessionId, "tool") as string | null | undefined;
  const model = useEntityField("sessions", sessionId, "model") as string | null | undefined;
  const reasoningEffort = useEntityField("sessions", sessionId, "reasoningEffort") as
    | string
    | null
    | undefined;
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as
    | string
    | null
    | undefined;
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus") as
    | string
    | null
    | undefined;
  const worktreeDeleted = useEntityField("sessions", sessionId, "worktreeDeleted") as
    | boolean
    | undefined;
  const isOptimistic = useEntityField("sessions", sessionId, "_optimistic");
  const connection = useEntityField("sessions", sessionId, "connection") as
    | SessionConnection
    | null
    | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | null | undefined;

  const currentTool: CodingTool =
    tool === "codex" || tool === "pi" || tool === "antigravity"
      ? (tool as CodingTool)
      : "claude_code";
  const effectiveTool = pendingTool ?? currentTool;
  const isTerminal =
    (worktreeDeleted === true || sessionStatus === "merged") && worktreeDeleted !== false;
  const isDisconnected = connection?.state === "disconnected";
  const canInteract = !isTerminal && !isDisconnected && agentStatus !== "active" && !isOptimistic;
  const canSelectModel = canInteract;

  const {
    currentTool: selectedTool,
    model: selectedModel,
    modelOptions,
    reasoningEffort: selectedReasoningEffort,
    reasoningEffortOptions,
    toolOptions,
    handleModelChange,
    handleReasoningEffortChange,
    handleToolChange,
  } = useSessionComposerConfig({
    connection,
    currentTool: effectiveTool,
    hosting,
    isNotStarted: agentStatus === "not_started",
    isOptimistic,
    model,
    reasoningEffort,
    sessionId,
    tool,
  });
  const providerGroups = getModelProviderGroupsForTool(selectedTool);

  useEffect(() => {
    if (pendingTool && currentTool === pendingTool) setPendingTool(null);
  }, [currentTool, pendingTool]);

  useEffect(() => {
    if (pendingModel && model === pendingModel) setPendingModel(null);
  }, [model, pendingModel]);

  useEffect(() => {
    if (pendingReasoningEffort && reasoningEffort === pendingReasoningEffort) {
      setPendingReasoningEffort(null);
    }
  }, [pendingReasoningEffort, reasoningEffort]);

  const handleSelectTool = useCallback(
    async (nextTool: CodingTool) => {
      if (!canInteract) return;
      if (selectedTool === nextTool) return;

      setPendingTool(nextTool);
      setPendingModel(getDefaultModel(nextTool) ?? null);
      setPendingReasoningEffort(getDefaultReasoningEffort(nextTool) ?? null);
      const changed = await handleToolChange(nextTool);
      if (!changed) {
        setPendingTool(null);
        setPendingModel(null);
        setPendingReasoningEffort(null);
      }
    },
    [canInteract, handleToolChange, selectedTool],
  );

  const handleSelectModel = useCallback(
    async (nextModel: string) => {
      if (!canSelectModel) return;
      if (selectedModel === nextModel) {
        onSelectModel?.();
        onClose?.();
        return;
      }

      onSelectModel?.();
      setPendingModel(nextModel);
      const changed = await handleModelChange(nextModel);
      setPendingModel(null);
      if (changed) {
        onClose?.();
      }
    },
    [canSelectModel, handleModelChange, onClose, onSelectModel, selectedModel],
  );

  const handleSelectReasoningEffort = useCallback(
    async (nextReasoningEffort: string) => {
      if (!canSelectModel) return;
      if (selectedReasoningEffort === nextReasoningEffort) return;

      setPendingReasoningEffort(nextReasoningEffort);
      await handleReasoningEffortChange(nextReasoningEffort);
      setPendingReasoningEffort(null);
    },
    [canSelectModel, handleReasoningEffortChange, selectedReasoningEffort],
  );

  const displayedTool = effectiveTool;
  const displayedModel = pendingModel ?? selectedModel;
  const displayedReasoningEffort = pendingReasoningEffort ?? selectedReasoningEffort;

  return (
    <ScrollView
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text variant="headline">Model</Text>
        <Text variant="footnote" color="mutedForeground">
          Pick the coding tool, model, and effort for this session before you send the next message.
        </Text>
      </View>

      <Section title="Tool">
        {toolOptions.map((option, index) => (
          <ListRow
            key={option.value}
            title={option.label}
            trailing={
              displayedTool === option.value ? (
                <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
              ) : undefined
            }
            onPress={
              canInteract && displayedTool !== option.value
                ? () => void handleSelectTool(option.value)
                : undefined
            }
            haptic={displayedTool === option.value ? "none" : "selection"}
            separator={index < toolOptions.length - 1}
            style={!canInteract ? styles.disabledRow : undefined}
          />
        ))}
      </Section>

      {providerGroups.length > 0 ? (
        providerGroups.map((group) => (
          <Section key={group.value} title={group.label}>
            {group.models.map((option, index) => (
              <ListRow
                key={option.value}
                title={option.label}
                subtitle={group.description}
                trailing={
                  displayedModel === option.value ? (
                    <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
                  ) : undefined
                }
                separator={index < group.models.length - 1}
                onPress={!canSelectModel ? undefined : () => void handleSelectModel(option.value)}
                haptic={displayedModel === option.value ? "none" : "selection"}
                style={!canSelectModel ? styles.disabledRow : undefined}
              />
            ))}
          </Section>
        ))
      ) : modelOptions.length > 0 ? (
        <Section title="Model">
          {modelOptions.map((option, index) => (
            <ListRow
              key={option.value}
              title={option.label}
              trailing={
                displayedModel === option.value ? (
                  <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
                ) : undefined
              }
              separator={index < modelOptions.length - 1}
              onPress={!canSelectModel ? undefined : () => void handleSelectModel(option.value)}
              haptic={displayedModel === option.value ? "none" : "selection"}
              style={!canSelectModel ? styles.disabledRow : undefined}
            />
          ))}
        </Section>
      ) : null}

      {reasoningEffortOptions.length > 0 ? (
        <Section title="Effort">
          {reasoningEffortOptions.map((option, index) => (
            <ListRow
              key={option.value}
              title={option.label}
              trailing={
                displayedReasoningEffort === option.value ? (
                  <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
                ) : undefined
              }
              separator={index < reasoningEffortOptions.length - 1}
              onPress={
                !canSelectModel ? undefined : () => void handleSelectReasoningEffort(option.value)
              }
              haptic={displayedReasoningEffort === option.value ? "none" : "selection"}
              style={!canSelectModel ? styles.disabledRow : undefined}
            />
          ))}
        </Section>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  header: {
    gap: 4,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  card: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  disabledRow: {
    opacity: 0.5,
  },
});
