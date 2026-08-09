import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { Question } from "@trace/shared";
import { Text } from "@/components/design-system";
import { questionColors, questionMetrics } from "./tokens";

export function QuestionFlowReference({ question, value, onChange }: { question: Question; value: string; onChange: (value: string) => void }) {
  const initial = value.split("\n").filter(Boolean);
  const [url, setUrl] = useState(() => initial.find(isUrl) ?? "");
  const [attachment, setAttachment] = useState<string | null>(() => initial.find((entry) => !isUrl(entry)) ?? null);
  const commit = (nextUrl: string, nextAttachment: string | null) => onChange([nextUrl.trim(), nextAttachment].filter(Boolean).join("\n"));
  const selectAttachment = (name: string) => { setAttachment(name); commit(url, name); };

  return (
    <View style={styles.control}>
      <View style={styles.sources}>
        <Pressable onPress={async () => { const picker = await import("expo-image-picker"); const result = await picker.launchImageLibraryAsync({ mediaTypes: ["images"] }); if (!result.canceled) selectAttachment(result.assets[0]?.fileName ?? "Photo Library image"); }} style={styles.sourceRow}>
          <View style={styles.sourceIcon}><SymbolView name="photo" size={18} tintColor={questionColors.foreground} /></View><Text variant="body" style={styles.sourceLabel}>Photo Library</Text><SymbolView name="chevron.right" size={14} tintColor={questionColors.muted} />
        </Pressable>
        <Pressable onPress={async () => { const picker = await import("expo-document-picker"); const result = await picker.getDocumentAsync({ type: question.accept ?? ["image/png", "image/jpeg", "application/pdf"] }); if (!result.canceled) selectAttachment(result.assets[0]?.name ?? "Reference file"); }} style={[styles.sourceRow, styles.last]}>
          <View style={styles.sourceIcon}><SymbolView name="doc" size={18} tintColor={questionColors.foreground} /></View><Text variant="body" style={styles.sourceLabel}>Choose File</Text><SymbolView name="chevron.right" size={14} tintColor={questionColors.muted} />
        </Pressable>
      </View>
      <View style={styles.urlRow}>
        <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder={question.placeholder ?? "Paste a reference URL"} placeholderTextColor={questionColors.muted} style={styles.urlInput} />
        <Pressable onPress={() => commit(url, attachment)} style={styles.add}><Text variant="callout" style={styles.addLabel}>Add</Text></Pressable>
      </View>
      {attachment ? (
        <View style={styles.attached}>
          <View style={styles.attachedIcon}><SymbolView name="doc.fill" size={19} tintColor={questionColors.success} /></View>
          <View style={styles.attachedCopy}><Text variant="subheadline" style={styles.attachmentName} numberOfLines={1}>{attachment}</Text><Text variant="footnote" style={styles.muted}>File · Added</Text></View>
          <Text variant="footnote" style={styles.added}>Added</Text>
          <Pressable accessibilityLabel={`Remove ${attachment}`} onPress={() => { setAttachment(null); commit(url, null); }} style={styles.remove}><SymbolView name="xmark" size={15} tintColor={questionColors.muted} /></Pressable>
        </View>
      ) : null}
    </View>
  );
}

function isUrl(value: string) { return /^https?:\/\//iu.test(value); }

const styles = StyleSheet.create({
  control: { marginTop: 28, gap: 16 }, sources: { borderRadius: questionMetrics.controlRadius, overflow: "hidden", backgroundColor: "rgba(23,23,25,0.88)" }, sourceRow: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: questionColors.border }, last: { borderBottomWidth: 0 }, sourceIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: questionColors.primary }, sourceLabel: { flex: 1, color: questionColors.foreground },
  urlRow: { flexDirection: "row", gap: 8 }, urlInput: { flex: 1, minHeight: 48, borderRadius: questionMetrics.controlRadius, paddingHorizontal: 16, fontSize: 16, color: questionColors.foreground, backgroundColor: "rgba(23,23,25,0.88)" }, add: { minHeight: 48, borderRadius: questionMetrics.controlRadius, paddingHorizontal: 16, justifyContent: "center", backgroundColor: "rgba(23,23,25,0.88)" }, addLabel: { color: questionColors.foreground, fontWeight: "600" },
  attached: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, borderRadius: questionMetrics.controlRadius, backgroundColor: "rgba(23,23,25,0.88)" }, attachedIcon: { width: 40, height: 40, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(48,209,88,0.2)" }, attachedCopy: { flex: 1 }, attachmentName: { color: questionColors.foreground, fontWeight: "600" }, muted: { color: questionColors.muted }, added: { color: questionColors.success, fontWeight: "600" }, remove: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
