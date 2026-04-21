import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { Question } from "@trace/shared";
import { Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";

interface PendingInputAnswerProps {
  question: Question;
  sending: boolean;
  /** Called with the trimmed answer text. Caller dispatches the mutation. */
  onAnswer: (answer: string) => void;
}

/**
 * Answer affordance for the question variant. Options render as pills (each
 * tap dispatches that label); a question with no options renders an inline
 * TextInput + Send button.
 */
export function PendingInputAnswer({ question, sending, onAnswer }: PendingInputAnswerProps) {
  const theme = useTheme();
  const [customText, setCustomText] = useState("");

  if (question.options.length > 0) {
    return (
      <View style={styles.optionsRow}>
        {question.options.map((opt) => (
          <Pressable
            key={opt.label}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            disabled={sending}
            onPress={() => onAnswer(opt.label)}
            style={({ pressed }) => [
              styles.optionPill,
              {
                backgroundColor: pressed
                  ? alpha(theme.colors.statusNeedsInput, 0.22)
                  : alpha(theme.colors.statusNeedsInput, 0.12),
                borderColor: alpha(theme.colors.statusNeedsInput, 0.36),
                opacity: sending ? 0.5 : 1,
              },
            ]}
          >
            <Text variant="footnote" color="foreground" style={styles.optionLabel}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  const trimmed = customText.trim();
  const handleSend = () => {
    if (!trimmed) return;
    onAnswer(trimmed);
    setCustomText("");
  };

  return (
    <View style={styles.inputRow}>
      <TextInput
        value={customText}
        onChangeText={setCustomText}
        onSubmitEditing={handleSend}
        placeholder="Type a response…"
        placeholderTextColor={theme.colors.dimForeground}
        editable={!sending}
        returnKeyType="send"
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surfaceDeep,
            borderColor: theme.colors.border,
            color: theme.colors.foreground,
          },
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send answer"
        disabled={sending || !trimmed}
        onPress={handleSend}
        style={({ pressed }) => [
          styles.sendButton,
          {
            backgroundColor: trimmed
              ? theme.colors.accent
              : alpha(theme.colors.accent, 0.4),
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <SymbolView
          name="arrow.up"
          size={16}
          tintColor={theme.colors.accentForeground}
          resizeMode="scaleAspectFit"
          style={styles.sendIcon}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  optionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  optionPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionLabel: { fontWeight: "500" },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  input: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 14,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  sendIcon: { width: 16, height: 16 },
});
