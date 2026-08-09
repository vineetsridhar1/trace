import { useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { Question } from "@trace/shared";
import { Text } from "@/components/design-system";
import type { FileAttachment } from "@/stores/drafts";
import { questionColors, questionMetrics } from "./tokens";
import { useQuestionReferencePicker } from "./useQuestionReferencePicker";

interface QuestionFlowReferenceProps {
  question: Question;
  value: string;
  attachments: readonly FileAttachment[];
  onChange: (value: string) => void;
  onAddAttachments: (attachments: FileAttachment[]) => void;
  onRemoveAttachment: (id: string) => void;
}

export function QuestionFlowReference({
  question,
  value,
  attachments,
  onChange,
  onAddAttachments,
  onRemoveAttachment,
}: QuestionFlowReferenceProps) {
  const [url, setUrl] = useState(value);
  const { error, picking, pickFiles, pickImages } = useQuestionReferencePicker({
    accept: question.accept,
    onAddAttachments,
  });

  useEffect(() => setUrl(value), [value]);

  return (
    <View style={styles.control}>
      <View style={styles.sources}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose images from Photo Library"
          disabled={picking}
          onPress={() => void pickImages()}
          style={({ pressed }) => [styles.sourceRow, pressed && styles.pressed]}
        >
          <View style={styles.sourceIcon}>
            <SymbolView name="photo" size={18} tintColor={questionColors.foreground} />
          </View>
          <Text variant="body" style={styles.sourceLabel}>Photo Library</Text>
          <SymbolView name="chevron.right" size={14} tintColor={questionColors.muted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose reference files"
          disabled={picking}
          onPress={() => void pickFiles()}
          style={({ pressed }) => [styles.sourceRow, styles.last, pressed && styles.pressed]}
        >
          <View style={styles.sourceIcon}>
            <SymbolView name="doc" size={18} tintColor={questionColors.foreground} />
          </View>
          <Text variant="body" style={styles.sourceLabel}>Choose File</Text>
          <SymbolView name="chevron.right" size={14} tintColor={questionColors.muted} />
        </Pressable>
      </View>

      <View style={styles.urlRow}>
        <TextInput
          accessibilityLabel="Reference URL"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder={question.placeholder ?? "Paste a reference URL"}
          placeholderTextColor={questionColors.muted}
          style={styles.urlInput}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add reference URL"
          onPress={() => onChange(url.trim())}
          style={({ pressed }) => [styles.add, pressed && styles.pressed]}
        >
          <Text variant="callout" style={styles.addLabel}>Add</Text>
        </Pressable>
      </View>

      {error ? <Text accessibilityRole="alert" variant="caption1" style={styles.error}>{error}</Text> : null}

      {attachments.map((attachment) => (
        <View key={attachment.id} style={styles.attached}>
          <View style={styles.attachedIcon}>
            <SymbolView name="doc.fill" size={19} tintColor={questionColors.success} />
          </View>
          <View style={styles.attachedCopy}>
            <Text variant="subheadline" style={styles.attachmentName} numberOfLines={1}>
              {attachment.filename}
            </Text>
            <Text variant="footnote" style={styles.muted}>File · Added</Text>
          </View>
          <Text variant="footnote" style={styles.added}>Added</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${attachment.filename}`}
            onPress={() => onRemoveAttachment(attachment.id)}
            style={styles.remove}
          >
            <SymbolView name="xmark" size={15} tintColor={questionColors.muted} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  control: { marginTop: 28, gap: 16 },
  sources: { borderRadius: questionMetrics.controlRadius, overflow: "hidden", backgroundColor: "rgba(23,23,25,0.88)" },
  sourceRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: questionColors.border },
  last: { borderBottomWidth: 0 },
  pressed: { opacity: 0.82 },
  sourceIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: questionColors.primary },
  sourceLabel: { flex: 1, color: questionColors.foreground },
  urlRow: { flexDirection: "row", gap: 8 },
  urlInput: { flex: 1, minHeight: 48, borderRadius: questionMetrics.controlRadius, paddingHorizontal: 16, fontSize: 16, color: questionColors.foreground, backgroundColor: "rgba(23,23,25,0.88)" },
  add: { minHeight: 48, borderRadius: questionMetrics.controlRadius, paddingHorizontal: 16, justifyContent: "center", backgroundColor: "rgba(23,23,25,0.88)" },
  addLabel: { color: questionColors.foreground, fontWeight: "600" },
  error: { color: questionColors.danger },
  attached: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, borderRadius: questionMetrics.controlRadius, backgroundColor: "rgba(23,23,25,0.88)" },
  attachedIcon: { width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(48,209,88,0.2)" },
  attachedCopy: { flex: 1 },
  attachmentName: { color: questionColors.foreground, fontWeight: "600" },
  muted: { color: questionColors.muted },
  added: { color: questionColors.success, fontWeight: "600" },
  remove: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
