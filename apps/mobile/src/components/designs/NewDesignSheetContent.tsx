import { useCallback, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Button, Glass, Text } from "@/components/design-system";
import { createDesign } from "@/lib/createQuickSession";
import { alpha, useTheme } from "@/theme";

export function NewDesignSheetContent() {
  const theme = useTheme();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const trimmedPrompt = prompt.trim();

  const handleSubmit = useCallback(async () => {
    if (!trimmedPrompt || submitting) return;
    setSubmitting(true);
    const created = await createDesign(trimmedPrompt);
    if (!created) setSubmitting(false);
  }, [submitting, trimmedPrompt]);

  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <Text variant="title2">Create a design</Text>
        <Text variant="footnote" color="mutedForeground">
          Describe the experience you want to design. Trace will create a cloud canvas for review.
        </Text>
      </View>

      <Glass
        preset="card"
        interactive
        style={[styles.inputGlass, { borderColor: theme.colors.border }]}
      >
        <TextInput
          accessibilityLabel="Design brief"
          value={prompt}
          onChangeText={setPrompt}
          placeholder="Design a mobile workspace for planning a product launch…"
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
          { borderColor: alpha(theme.colors.accent, 0.38), opacity: trimmedPrompt ? 1 : 0.54 },
        ]}
      >
        <Button
          title="Start designing"
          variant="ghost"
          size="lg"
          loading={submitting}
          disabled={!trimmedPrompt}
          onPress={() => void handleSubmit()}
        />
      </Glass>
      <Text variant="caption2" color="dimForeground" align="center">
        Designs always run in Trace Cloud.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: 18 },
  header: { alignItems: "flex-start", gap: 3 },
  inputGlass: { minHeight: 132, borderWidth: StyleSheet.hairlineWidth },
  input: {
    flex: 1,
    minHeight: 132,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 22,
  },
  buttonGlass: { borderWidth: StyleSheet.hairlineWidth },
});
