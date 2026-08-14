import { StyleSheet, TextInput, View } from "react-native";
import type { Question, QuestionType } from "@trace/shared";
import { Text } from "@/components/design-system";
import type { FileAttachment } from "@/stores/drafts";
import { QuestionFlowConfirmOption } from "./QuestionFlowConfirmOption";
import { QuestionFlowOption } from "./QuestionFlowOption";
import { QuestionFlowRanking } from "./QuestionFlowRanking";
import { QuestionFlowReference } from "./QuestionFlowReference";
import { QuestionFlowText } from "./QuestionFlowText";
import { questionColors, questionMetrics } from "./tokens";

interface QuestionFlowControlProps {
  question: Question;
  type: QuestionType;
  selected: ReadonlySet<string>;
  custom: string;
  ranking: readonly string[];
  referenceAttachments: readonly FileAttachment[];
  onToggle: (value: string) => void;
  onCustom: (value: string) => void;
  onMove: (value: string, direction: -1 | 1) => void;
  onAddReferenceAttachments: (attachments: FileAttachment[]) => void;
  onRemoveReferenceAttachment: (id: string) => void;
}

export function QuestionFlowControl({
  question,
  type,
  selected,
  custom,
  ranking,
  referenceAttachments,
  onToggle,
  onCustom,
  onMove,
  onAddReferenceAttachments,
  onRemoveReferenceAttachment,
}: QuestionFlowControlProps) {
  if (type === "reference") {
    return (
      <QuestionFlowReference
        question={question}
        value={custom}
        attachments={referenceAttachments}
        onChange={onCustom}
        onAddAttachments={onAddReferenceAttachments}
        onRemoveAttachment={onRemoveReferenceAttachment}
      />
    );
  }
  if (type === "text") {
    return <QuestionFlowText question={question} value={custom} onChange={onCustom} />;
  }
  if (type === "ranking") {
    return <QuestionFlowRanking question={question} ranking={ranking} onMove={onMove} />;
  }

  const options =
    type === "confirm" && question.options.length === 0
      ? [
          { id: "yes", label: "Yes, continue", description: "Use this direction" },
          { id: "no", label: "Not yet", description: "Keep exploring" },
        ]
      : question.options;

  if (type === "confirm") {
    return (
      <View style={styles.control}>
        <View style={styles.confirm}>
          {options.slice(0, 2).map((option, index) => {
            const value = option.id ?? option.label;
            const positive =
              value.toLowerCase() === "yes" || option.label.toLowerCase().startsWith("yes");
            return (
              <QuestionFlowConfirmOption
                key={value}
                label={option.label || (index === 0 ? "Yes, continue" : "Not yet")}
                description={
                  option.description || (positive ? "Use this direction" : "Keep exploring")
                }
                positive={positive}
                selected={selected.has(value)}
                onPress={() => onToggle(value)}
              />
            );
          })}
        </View>
      </View>
    );
  }

  const multi = type === "multi-select";
  const showOther = type === "select-with-other" || question.other;
  return (
    <View style={styles.control}>
      {question.min != null || question.max != null ? (
        <View style={styles.status}>
          <Text variant="caption1" style={styles.muted}>
            {question.min != null && question.max != null
              ? `Pick ${question.min}–${question.max}`
              : question.min != null
                ? `Pick at least ${question.min}`
                : `Pick up to ${question.max}`}
          </Text>
          <Text
            variant="caption1"
            style={{
              color: isValidCount(selected.size, question.min, question.max)
                ? questionColors.success
                : questionColors.danger,
            }}
          >
            {selected.size} selected
          </Text>
        </View>
      ) : null}

      <View style={styles.options}>
        {options.map((option) => {
          const value = option.id ?? option.label;
          return (
            <QuestionFlowOption
              key={value}
              label={option.label}
              description={option.description}
              selected={selected.has(value)}
              multiple={multi}
              onPress={() => onToggle(value)}
            />
          );
        })}
        {showOther ? (
          <QuestionFlowOption
            label="Something else"
            description="Write a different answer"
            selected={selected.has("other")}
            multiple={multi}
            onPress={() => onToggle("other")}
          />
        ) : null}
      </View>

      {showOther && selected.has("other") ? (
        <TextInput
          accessibilityLabel="Custom answer"
          value={custom}
          onChangeText={onCustom}
          multiline
          placeholder="Write your own answer…"
          placeholderTextColor={questionColors.muted}
          style={styles.otherInput}
        />
      ) : null}
    </View>
  );
}

function isValidCount(count: number, min?: number, max?: number) {
  return !(min != null && count < min) && !(max != null && count > max);
}

const styles = StyleSheet.create({
  control: { marginTop: 28, gap: 12 },
  muted: { color: questionColors.muted },
  status: { flexDirection: "row", justifyContent: "space-between" },
  options: { gap: 12 },
  confirm: { flexDirection: "row", gap: 12 },
  otherInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: "rgba(0,116,225,0.5)",
    borderRadius: questionMetrics.controlRadius,
    padding: 12,
    fontSize: 14,
    color: questionColors.foreground,
    backgroundColor: "rgba(23,23,25,0.88)",
    textAlignVertical: "top",
  },
});
