import { Pressable, StyleSheet, TextInput, View } from "react-native";
import type { Question } from "@trace/shared";
import { Text } from "@/components/design-system";
import { questionColors, questionMetrics } from "./tokens";

export function QuestionFlowText({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.control}>
      <TextInput
        accessibilityLabel={question.question}
        value={value}
        onChangeText={onChange}
        multiline
        maxLength={question.maxLength}
        placeholder={question.placeholder ?? "Type your answer…"}
        placeholderTextColor={questionColors.muted}
        style={styles.textInput}
      />
      <View style={styles.suggestions}>
        {question.suggestions?.map((suggestion) => (
          <Pressable
            key={suggestion}
            accessibilityRole="button"
            accessibilityLabel={`Use suggestion: ${suggestion}`}
            onPress={() => onChange(suggestion)}
            style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
          >
            <Text variant="caption1" style={styles.muted}>{suggestion}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  control: { marginTop: 28, gap: 12 },
  muted: { color: questionColors.muted },
  textInput: { minHeight: 144, borderWidth: 1, borderColor: "rgba(0,116,225,0.5)", borderRadius: questionMetrics.controlRadius, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, lineHeight: 24, color: questionColors.foreground, backgroundColor: "rgba(23,23,25,0.88)", textAlignVertical: "top" },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestion: { minHeight: 44, borderWidth: 1, borderColor: questionColors.border, borderRadius: 22, paddingHorizontal: 12, justifyContent: "center" },
  pressed: { opacity: 0.82 },
});
