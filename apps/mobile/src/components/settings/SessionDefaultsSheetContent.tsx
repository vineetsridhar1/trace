import { useMemo, useState, type ReactNode } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import {
  UPDATE_SESSION_DEFAULTS_MUTATION,
  useAuthStore,
  type AuthState,
} from "@trace/client-core";
import type { CodingTool, User } from "@trace/gql";
import {
  getDefaultModel,
  getDefaultReasoningEffort,
  getModelLabel,
  getModelProviderGroupsForTool,
  getModelsForTool,
  getReasoningEffortLabel,
  getReasoningEffortsForTool,
} from "@trace/shared";
import { ListRow, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { useTheme } from "@/theme";

const TOOL_OPTIONS = [
  { value: "claude_code" as const, label: "Claude Code" },
  { value: "codex" as const, label: "Codex" },
  { value: "pi" as const, label: "Pi" },
  { value: "antigravity" as const, label: "Antigravity" },
];

type SessionDefaultsPatch = Pick<
  User,
  | "defaultSessionTool"
  | "defaultSessionModel"
  | "defaultSessionReasoningEffort"
  | "autoArchiveMergedSessions"
  | "enableClaudeInChrome"
>;

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

function updateAuthUser(patch: SessionDefaultsPatch) {
  useAuthStore.setState((state: AuthState) => ({
    user: state.user ? { ...state.user, ...patch } : state.user,
  }));
}

async function saveDefaults(input: {
  tool?: CodingTool | null;
  model?: string | null;
  reasoningEffort?: string | null;
  autoArchiveMergedSessions?: boolean;
}) {
  const result = await getClient()
    .mutation<{ updateSessionDefaults: SessionDefaultsPatch }>(UPDATE_SESSION_DEFAULTS_MUTATION, {
      input,
    })
    .toPromise();
  if (result.error) throw result.error;
  if (result.data?.updateSessionDefaults) updateAuthUser(result.data.updateSessionDefaults);
}

export function SessionDefaultsSheetContent() {
  const theme = useTheme();
  const user = useAuthStore((s: AuthState) => s.user);
  const selectedTool = user?.defaultSessionTool ?? null;
  const selectedModel = user?.defaultSessionModel ?? null;
  const selectedReasoningEffort = user?.defaultSessionReasoningEffort ?? null;
  const autoArchiveMergedSessions = user?.autoArchiveMergedSessions ?? true;
  const enableClaudeInChrome = user?.enableClaudeInChrome ?? false;
  const effectiveTool = selectedTool ?? "claude_code";
  const [pending, setPending] = useState(false);

  const modelOptions = useMemo(() => getModelsForTool(effectiveTool), [effectiveTool]);
  const modelProviderGroups = useMemo(
    () => getModelProviderGroupsForTool(effectiveTool),
    [effectiveTool],
  );
  const reasoningEffortOptions = useMemo(
    () => getReasoningEffortsForTool(effectiveTool),
    [effectiveTool],
  );

  async function handleSave(input: {
    tool?: CodingTool | null;
    model?: string | null;
    reasoningEffort?: string | null;
    autoArchiveMergedSessions?: boolean;
    enableClaudeInChrome?: boolean;
  }) {
    if (pending) return;
    setPending(true);
    try {
      await saveDefaults(input);
      void haptic.success();
    } catch (error) {
      void haptic.error();
      Alert.alert(
        "Couldn't update defaults",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { padding: theme.spacing.lg }]}
    >
      <View style={styles.header}>
        <Text variant="headline">Session defaults</Text>
        <Text variant="footnote" color="mutedForeground">
          Pick the coding tool, model, and effort new sessions should use.
        </Text>
      </View>

      <Section title="Tool">
        {TOOL_OPTIONS.map((option, index) => (
          <ListRow
            key={option.value}
            title={option.label}
            trailing={
              selectedTool === option.value ? (
                <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
              ) : undefined
            }
            onPress={() =>
              void handleSave({
                tool: option.value,
                model: getDefaultModel(option.value) ?? null,
                reasoningEffort: getDefaultReasoningEffort(option.value) ?? null,
              })
            }
            haptic={selectedTool === option.value ? "none" : "selection"}
            separator={index < TOOL_OPTIONS.length - 1}
            style={pending ? styles.disabledRow : undefined}
          />
        ))}
      </Section>

      {modelProviderGroups.length > 0 ? (
        modelProviderGroups.map((group) => (
          <Section key={group.value} title={group.label}>
            {group.models.map((option, index) => (
              <ListRow
                key={option.value}
                title={option.label}
                subtitle={group.description}
                trailing={
                  selectedModel === option.value ? (
                    <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
                  ) : undefined
                }
                onPress={
                  selectedTool
                    ? () =>
                        void handleSave({
                          tool: selectedTool,
                          model: option.value,
                          reasoningEffort: selectedReasoningEffort,
                        })
                    : undefined
                }
                haptic={selectedModel === option.value ? "none" : "selection"}
                separator={index < group.models.length - 1}
                style={pending || !selectedTool ? styles.disabledRow : undefined}
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
                selectedModel === option.value ? (
                  <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
                ) : undefined
              }
              onPress={
                selectedTool
                  ? () =>
                      void handleSave({
                        tool: selectedTool,
                        model: option.value,
                        reasoningEffort: selectedReasoningEffort,
                      })
                  : undefined
              }
              haptic={selectedModel === option.value ? "none" : "selection"}
              separator={index < modelOptions.length - 1}
              style={pending || !selectedTool ? styles.disabledRow : undefined}
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
                selectedReasoningEffort === option.value ? (
                  <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
                ) : undefined
              }
              onPress={
                selectedTool
                  ? () =>
                      void handleSave({
                        tool: selectedTool,
                        model: selectedModel,
                        reasoningEffort: option.value,
                      })
                  : undefined
              }
              haptic={selectedReasoningEffort === option.value ? "none" : "selection"}
              separator={index < reasoningEffortOptions.length - 1}
              style={pending || !selectedTool ? styles.disabledRow : undefined}
            />
          ))}
        </Section>
      ) : null}

      <Section title="Merged sessions">
        {[
          { value: true, label: "Auto archive" },
          { value: false, label: "Keep visible" },
        ].map((option, index, options) => (
          <ListRow
            key={String(option.value)}
            title={option.label}
            trailing={
              autoArchiveMergedSessions === option.value ? (
                <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
              ) : undefined
            }
            onPress={() => void handleSave({ autoArchiveMergedSessions: option.value })}
            haptic={autoArchiveMergedSessions === option.value ? "none" : "selection"}
            separator={index < options.length - 1}
            style={pending ? styles.disabledRow : undefined}
          />
        ))}
      </Section>

      <Section title="Claude in Chrome">
        {[
          { value: true, label: "Enabled" },
          { value: false, label: "Disabled" },
        ].map((option, index, options) => (
          <ListRow
            key={String(option.value)}
            title={option.label}
            trailing={
              enableClaudeInChrome === option.value ? (
                <SymbolView name="checkmark" size={16} tintColor={theme.colors.accent} />
              ) : undefined
            }
            onPress={() => void handleSave({ enableClaudeInChrome: option.value })}
            haptic={enableClaudeInChrome === option.value ? "none" : "selection"}
            separator={index < options.length - 1}
            style={pending ? styles.disabledRow : undefined}
          />
        ))}
      </Section>
    </ScrollView>
  );
}

export function formatSessionDefaultsSummary(user: {
  defaultSessionTool?: CodingTool | null;
  defaultSessionModel?: string | null;
  defaultSessionReasoningEffort?: string | null;
}) {
  if (!user.defaultSessionTool) return "Choose tool, model, and effort";
  const toolLabel =
    TOOL_OPTIONS.find((option) => option.value === user.defaultSessionTool)?.label ??
    user.defaultSessionTool;
  const parts = [toolLabel];
  if (user.defaultSessionModel) parts.push(getModelLabel(user.defaultSessionModel));
  if (user.defaultSessionReasoningEffort) {
    parts.push(getReasoningEffortLabel(user.defaultSessionReasoningEffort));
  }
  return parts.join(" · ");
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingBottom: 32,
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
