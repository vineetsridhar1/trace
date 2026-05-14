import { useCallback, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useEntityField } from "@trace/client-core";
import type { CodingTool, SessionConnection } from "@trace/gql";
import {
  getDefaultModelForProvider,
  getModelProviderForModel,
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
    tool === "codex" || tool === "pi" ? (tool as CodingTool) : "claude_code";
  const isTerminal = worktreeDeleted === true || sessionStatus === "merged";
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
    currentTool,
    hosting,
    isNotStarted: agentStatus === "not_started",
    isOptimistic,
    model,
    reasoningEffort,
    sessionId,
    tool,
  });

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

  const displayedModel = pendingModel ?? selectedModel;
  const displayedReasoningEffort = pendingReasoningEffort ?? selectedReasoningEffort;
  const modelProviderGroups = getModelProviderGroupsForTool(selectedTool);
  const currentModelProvider =
    getModelProviderForModel(selectedTool, displayedModel) ?? modelProviderGroups[0];
  const visibleModelOptions = currentModelProvider?.models ?? modelOptions;

  const handleSelectModelProvider = useCallback(
    async (provider: string) => {
      if (!canSelectModel) return;
      const nextModel = getDefaultModelForProvider(selectedTool, provider);
      if (!nextModel) return;
      if (selectedModel === nextModel) return;

      setPendingModel(nextModel);
      await handleModelChange(nextModel);
      setPendingModel(null);
    },
    [canSelectModel, handleModelChange, selectedModel, selectedTool],
  );

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
              selectedTool === option.value ? (
                <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
              ) : undefined
            }
            onPress={
              canInteract && selectedTool !== option.value
                ? () => void handleToolChange(option.value)
                : undefined
            }
            haptic={selectedTool === option.value ? "none" : "selection"}
            separator={index < toolOptions.length - 1}
            style={!canInteract ? styles.disabledRow : undefined}
          />
        ))}
      </Section>

      {modelProviderGroups.length > 0 && currentModelProvider ? (
        <Section title="Provider">
          {modelProviderGroups.map((option, index) => (
            <ListRow
              key={option.value}
              title={option.label}
              subtitle={option.description}
              trailing={
                currentModelProvider.value === option.value ? (
                  <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
                ) : undefined
              }
              separator={index < modelProviderGroups.length - 1}
              onPress={
                !canSelectModel || currentModelProvider.value === option.value
                  ? undefined
                  : () => void handleSelectModelProvider(option.value)
              }
              haptic={currentModelProvider.value === option.value ? "none" : "selection"}
              style={!canSelectModel ? styles.disabledRow : undefined}
            />
          ))}
        </Section>
      ) : null}

      <Section title="Model">
        {visibleModelOptions.map((option, index) => (
          <ListRow
            key={option.value}
            title={option.label}
            trailing={
              displayedModel === option.value ? (
                <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
              ) : undefined
            }
            separator={index < visibleModelOptions.length - 1}
            onPress={!canSelectModel ? undefined : () => void handleSelectModel(option.value)}
            haptic={displayedModel === option.value ? "none" : "selection"}
            style={!canSelectModel ? styles.disabledRow : undefined}
          />
        ))}
      </Section>

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
