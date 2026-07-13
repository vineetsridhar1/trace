import { useCallback, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Button, Glass, Text } from "@/components/design-system";
import { createApplication } from "@/lib/createQuickSession";
import { alpha, useTheme } from "@/theme";

export function NewApplicationSheetContent() {
  const theme = useTheme();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const trimmedPrompt = prompt.trim();

  const handleSubmit = useCallback(async () => {
    if (!trimmedPrompt || submitting) return;
    setSubmitting(true);
    const created = await createApplication(trimmedPrompt);
    if (!created) setSubmitting(false);
  }, [submitting, trimmedPrompt]);

  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <View
          style={[
            styles.iconShell,
            {
              backgroundColor: alpha(theme.colors.accent, 0.12),
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          <SymbolView
            name="globe"
            size={24}
            tintColor={theme.colors.accent}
            resizeMode="scaleAspectFit"
          />
        </View>
        <View style={styles.headerText}>
          <Text variant="title2">Build an application</Text>
          <Text variant="footnote" color="mutedForeground">
            Describe what you want. Trace will create a cloud app and open its live preview.
          </Text>
        </View>
      </View>

      <Glass
        preset="card"
        interactive
        style={[
          styles.inputGlass,
          {
            borderColor: theme.colors.border,
          },
        ]}
      >
        <TextInput
          accessibilityLabel="Application description"
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Build a shared launch tracker with owners, due dates, and status updates…"
          placeholderTextColor={theme.colors.dimForeground}
          selectionColor={theme.colors.accent}
          keyboardAppearance="dark"
          autoFocus
          multiline
          maxLength={4000}
          editable={!submitting}
          textAlignVertical="top"
          style={[styles.input, { color: theme.colors.foreground }]}
        />
      </Glass>

      <Glass
        preset="input"
        tint={alpha(theme.colors.accent, 0.32)}
        interactive={Boolean(trimmedPrompt) && !submitting}
        style={[
          styles.buttonGlass,
          {
            borderColor: alpha(theme.colors.accent, 0.38),
            opacity: trimmedPrompt ? 1 : 0.54,
          },
        ]}
      >
        <Button
          title="Start building"
          variant="ghost"
          size="lg"
          loading={submitting}
          disabled={!trimmedPrompt}
          onPress={() => void handleSubmit()}
        />
      </Glass>
      <Text variant="caption2" color="dimForeground" align="center">
        Applications always run in Trace Cloud.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconShell: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    gap: 3,
  },
  inputGlass: {
    minHeight: 132,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 132,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 22,
  },
  buttonGlass: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
