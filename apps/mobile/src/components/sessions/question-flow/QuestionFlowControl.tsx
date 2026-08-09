import { Pressable, StyleSheet, TextInput, View } from "react-native";
import type { Question } from "@trace/shared";
import { Text } from "@/components/design-system";
import { QuestionFlowConfirmOption } from "./QuestionFlowConfirmOption";
import { QuestionFlowOption } from "./QuestionFlowOption";
import { questionColors, questionMetrics } from "./tokens";

export function QuestionFlowControl({ question, type, selected, custom, ranking, onToggle, onCustom, onMove }: { question: Question; type: string; selected: ReadonlySet<string>; custom: string; ranking: readonly string[]; onToggle: (value: string) => void; onCustom: (value: string) => void; onMove: (value: string, direction: -1 | 1) => void }) {
  if (type === "reference") return <ReferenceControl question={question} value={custom} onChange={onCustom} />;
  if (type === "text") return <TextControl question={question} value={custom} onChange={onCustom} />;
  if (type === "ranking") return <View style={styles.control}>{ranking.map((value, index) => <View key={value} style={styles.rankRow}><Text variant="subheadline" style={styles.rankNumber}>{index + 1}</Text><Text variant="subheadline" style={styles.rankLabel}>{question.options.find((option) => (option.id ?? option.label) === value)?.label ?? value}</Text><Pressable disabled={index === 0} onPress={() => onMove(value, -1)}><Text variant="title2" style={styles.muted}>↑</Text></Pressable><Pressable disabled={index === ranking.length - 1} onPress={() => onMove(value, 1)}><Text variant="title2" style={styles.muted}>↓</Text></Pressable></View>)}</View>;
  const options = type === "confirm" && question.options.length === 0 ? [{ id: "yes", label: "Yes, continue", description: "Use this direction" }, { id: "no", label: "Not yet", description: "Keep exploring" }] : question.options;
  if (type === "confirm") {
    return (
      <View style={styles.control}>
        <View style={styles.confirm}>
          {options.slice(0, 2).map((option, index) => {
            const value = option.id ?? option.label;
            const positive = value.toLowerCase() === "yes" || option.label.toLowerCase().startsWith("yes");
            return (
              <QuestionFlowConfirmOption
                key={value}
                label={option.label || (index === 0 ? "Yes, continue" : "Not yet")}
                description={option.description || (positive ? "Use this direction" : "Keep exploring")}
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
  return <View style={styles.control}>{question.min != null || question.max != null ? <View style={styles.status}><Text variant="caption1" style={styles.muted}>{question.min != null && question.max != null ? `Pick ${question.min}–${question.max}` : question.min != null ? `Pick at least ${question.min}` : `Pick up to ${question.max}`}</Text><Text variant="caption1" style={{ color: isValidCount(selected.size, question.min, question.max) ? questionColors.success : questionColors.danger }}>{selected.size} selected</Text></View> : null}<View style={type === "confirm" ? styles.confirm : styles.options}>{options.map((option) => <QuestionFlowOption key={option.id ?? option.label} label={option.label} description={option.description} selected={selected.has(option.id ?? option.label)} multiple={multi} onPress={() => onToggle(option.id ?? option.label)} />)}{type === "select-with-other" || question.other ? <QuestionFlowOption label="Something else" description="Write a different answer" selected={selected.has("other")} onPress={() => onToggle("other")} /> : null}</View>{(type === "select-with-other" || question.other) && selected.has("other") ? <TextInput value={custom} onChangeText={onCustom} multiline placeholder="Write your own answer…" placeholderTextColor={questionColors.muted} style={styles.otherInput} /> : null}</View>;
}

function TextControl({ question, value, onChange }: { question: Question; value: string; onChange: (value: string) => void }) { return <View style={styles.control}><TextInput value={value} onChangeText={onChange} multiline maxLength={question.maxLength} placeholder={question.placeholder ?? "Type your answer…"} placeholderTextColor={questionColors.muted} style={styles.textInput} /><View style={styles.suggestions}>{question.suggestions?.map((suggestion) => <Pressable key={suggestion} onPress={() => onChange(suggestion)} style={styles.suggestion}><Text variant="caption1" style={styles.muted}>{suggestion}</Text></Pressable>)}</View></View>; }

function ReferenceControl({ question, value, onChange }: { question: Question; value: string; onChange: (value: string) => void }) { return <View style={styles.control}><View style={styles.sources}><Pressable onPress={async () => { const picker = await import("expo-image-picker"); const result = await picker.launchImageLibraryAsync({ mediaTypes: ["images"] }); if (!result.canceled) onChange(result.assets[0]?.fileName ?? "Photo Library image"); }} style={styles.sourceRow}><Text variant="body" style={styles.sourceIcon}>▧</Text><Text variant="body" style={styles.sourceLabel}>Photo Library</Text><Text variant="body" style={styles.muted}>›</Text></Pressable><Pressable onPress={async () => { const picker = await import("expo-document-picker"); const result = await picker.getDocumentAsync({ type: question.accept ?? ["image/png", "image/jpeg", "application/pdf"] }); if (!result.canceled) onChange(result.assets[0]?.name ?? "Reference file"); }} style={[styles.sourceRow, styles.last]}><Text variant="body" style={styles.sourceIcon}>⌁</Text><Text variant="body" style={styles.sourceLabel}>Choose File</Text><Text variant="body" style={styles.muted}>›</Text></Pressable></View><TextInput value={value} onChangeText={onChange} placeholder={question.placeholder ?? "Paste a reference URL"} placeholderTextColor={questionColors.muted} style={styles.referenceInput} />{value ? <View style={styles.attached}><Text variant="body" style={styles.attachedIcon}>▣</Text><View style={styles.attachedCopy}><Text variant="subheadline" style={styles.sourceLabel} numberOfLines={1}>{value}</Text><Text variant="footnote" style={styles.muted}>Reference · Added</Text></View><Pressable onPress={() => onChange("")}><Text variant="title2" style={styles.muted}>×</Text></Pressable></View> : null}</View>; }

function isValidCount(count: number, min?: number, max?: number) { return !(min != null && count < min) && !(max != null && count > max); }

const styles = StyleSheet.create({
  control: { marginTop: 28, gap: 12 }, muted: { color: questionColors.muted }, status: { flexDirection: "row", justifyContent: "space-between" }, options: { gap: 12 }, confirm: { flexDirection: "row", gap: 12 }, textInput: { minHeight: 144, borderWidth: 1, borderColor: "rgba(0,116,225,0.5)", borderRadius: questionMetrics.controlRadius, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, lineHeight: 24, color: questionColors.foreground, backgroundColor: "rgba(23,23,25,0.88)", textAlignVertical: "top" }, otherInput: { minHeight: 96, borderWidth: 1, borderColor: "rgba(0,116,225,0.5)", borderRadius: questionMetrics.controlRadius, padding: 12, fontSize: 14, color: questionColors.foreground, backgroundColor: "rgba(23,23,25,0.88)", textAlignVertical: "top" }, suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, suggestion: { minHeight: 44, borderWidth: 1, borderColor: questionColors.border, borderRadius: 22, paddingHorizontal: 12, justifyContent: "center" }, rankRow: { minHeight: questionMetrics.rowHeight, borderWidth: 1, borderColor: questionColors.border, borderRadius: questionMetrics.controlRadius, backgroundColor: "rgba(23,23,25,0.88)", paddingHorizontal: 12, flexDirection: "row", gap: 12, alignItems: "center" }, rankNumber: { width: 28, height: 28, borderRadius: 14, textAlign: "center", lineHeight: 28, color: questionColors.foreground, backgroundColor: questionColors.primary, fontWeight: "700" }, rankLabel: { flex: 1, color: questionColors.foreground, fontWeight: "600" }, sources: { borderRadius: questionMetrics.controlRadius, overflow: "hidden", backgroundColor: "rgba(23,23,25,0.88)" }, sourceRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: questionColors.border }, last: { borderBottomWidth: 0 }, sourceIcon: { width: 32, height: 32, borderRadius: 8, lineHeight: 32, textAlign: "center", color: questionColors.foreground, backgroundColor: questionColors.primary }, sourceLabel: { flex: 1, color: questionColors.foreground }, referenceInput: { minHeight: 48, borderRadius: questionMetrics.controlRadius, paddingHorizontal: 16, fontSize: 16, color: questionColors.foreground, backgroundColor: "rgba(23,23,25,0.88)" }, attached: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, borderRadius: questionMetrics.controlRadius, backgroundColor: "rgba(23,23,25,0.88)" }, attachedIcon: { width: 40, height: 40, borderRadius: 8, lineHeight: 40, textAlign: "center", color: questionColors.success, backgroundColor: "rgba(48,209,88,0.2)" }, attachedCopy: { flex: 1 },
});
