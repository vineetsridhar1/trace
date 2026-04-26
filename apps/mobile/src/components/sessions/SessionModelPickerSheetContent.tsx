import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { useEntityField } from "@trace/client-core";
import type { CodingTool, SessionConnection } from "@trace/gql";
import { ListRow, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";
import { useSessionComposerConfig } from "./session-input-composer/useSessionComposerConfig";

interface SessionModelPickerSheetContentProps {
  sessionId: string;
  onClose?: () => void;
  onSelectModel?: () => void;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const [pendingModel, setPendingModel] = useState<string | null>(null);
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

function ModelRow({
  title,
  selected,
  separator,
  disabled,
  onSelect,
}: {
  title: string;
  selected: boolean;
  separator: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const theme = useTheme();
  const handledTouchRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const commit = useCallback(() => {
    if (disabled) return;
    void haptic.selection();
    onSelect();
  }, [disabled, onSelect]);

  const handleTouchStart = useCallback((event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    touchStartRef.current = { x: pageX, y: pageY };
  }, []);

  const handleTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;

      const { pageX, pageY } = event.nativeEvent;
      const movedX = Math.abs(pageX - start.x);
      const movedY = Math.abs(pageY - start.y);
      if (movedX > 10 || movedY > 10) return;

      handledTouchRef.current = true;
      commit();
    },
    [commit],
  );

  const handlePress = useCallback(() => {
    if (handledTouchRef.current) {
      handledTouchRef.current = false;
      return;
    }
    commit();
  }, [commit]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.modelRow,
        {
          borderBottomColor: theme.colors.border,
          borderBottomWidth: separator ? StyleSheet.hairlineWidth : 0,
        },
        pressed && { backgroundColor: theme.colors.surfaceElevated },
        disabled && styles.disabledRow,
      ]}
    >
      <Text variant="body" numberOfLines={1} style={styles.modelRowTitle}>
        {title}
      </Text>
      {selected ? (
        <SymbolView
          name="checkmark"
          size={16}
          tintColor={theme.colors.accent}
        />
      ) : null}
    </Pressable>
  );
}

export function SessionModelPickerSheetContent({
  sessionId,
  onClose,
  onSelectModel,
}: SessionModelPickerSheetContentProps) {
  const theme = useTheme();

  const tool = useEntityField("sessions", sessionId, "tool") as string | null | undefined;
  const model = useEntityField("sessions", sessionId, "model") as string | null | undefined;
  const agentStatus = useEntityField("sessions", sessionId, "agentStatus") as string | null | undefined;
  const sessionStatus = useEntityField("sessions", sessionId, "sessionStatus") as string | null | undefined;
  const worktreeDeleted = useEntityField("sessions", sessionId, "worktreeDeleted") as
    | boolean
    | undefined;
  const isOptimistic = useEntityField("sessions", sessionId, "_optimistic");
  const connection = useEntityField("sessions", sessionId, "connection") as
    | SessionConnection
    | null
    | undefined;
  const hosting = useEntityField("sessions", sessionId, "hosting") as string | null | undefined;

  const currentTool: CodingTool = tool === "codex" ? "codex" : "claude_code";
  const isTerminal = worktreeDeleted === true || sessionStatus === "merged";
  const isDisconnected = connection?.state === "disconnected";
  const canInteract = !isTerminal && !isDisconnected && agentStatus !== "active" && !isOptimistic;

  const {
    currentTool: selectedTool,
    model: selectedModel,
    modelOptions,
    toolOptions,
    handleModelChange,
    handleToolChange,
  } = useSessionComposerConfig({
    connection,
    currentTool,
    hosting,
    isNotStarted: agentStatus === "not_started",
    isOptimistic,
    model,
    sessionId,
    tool,
  });

  const handleSelectModel = useCallback(
    async (nextModel: string) => {
      if (!canInteract) return;
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
    [canInteract, handleModelChange, onClose, onSelectModel, selectedModel],
  );

  const displayedModel = pendingModel ?? selectedModel;

  return (
    <ScrollView
      keyboardShouldPersistTaps="always"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text variant="headline">Model</Text>
        <Text variant="footnote" color="mutedForeground">
          Pick the coding tool and model for this session before you send the next message.
        </Text>
      </View>

      <Section title="Tool">
        {toolOptions.map((option, index) => (
          <ListRow
            key={option.value}
            title={option.label}
            trailing={
              selectedTool === option.value ? (
                <SymbolView
                  name="checkmark"
                  size={16}
                  tintColor={theme.colors.accent}
                />
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

      <Section title="Model">
        {modelOptions.map((option, index) => (
          <ModelRow
            key={option.value}
            title={option.label}
            selected={displayedModel === option.value}
            disabled={!canInteract}
            separator={index < modelOptions.length - 1}
            onSelect={() => void handleSelectModel(option.value)}
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
  modelRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  modelRowTitle: {
    flex: 1,
  },
});
