import { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SEND_SESSION_MESSAGE_MUTATION, useQuestionState } from "@trace/client-core";
import type { Question } from "@trace/shared";
import { Glass, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";

interface PendingInputQuestionProps {
  sessionId: string;
  questions: Question[];
  keyboardVisible?: boolean;
  hasActivePlan: boolean;
  onClose: () => void;
}

/** Full-screen, touch-first answer flow for a pending structured question. */
export function PendingInputQuestion({
  sessionId,
  questions,
  hasActivePlan,
  onClose,
}: PendingInputQuestionProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const {
    page,
    total,
    question,
    currentSelected,
    currentCustom,
    currentRanking,
    currentValid,
    validationMessage,
    isFirstPage,
    isLastPage,
    hasAllAnswers,
    answers,
    toggleOption,
    setCustomText,
    setPage,
    decideForMe,
    moveRankOption,
    goNext,
    goPrev,
    buildResponse,
  } = useQuestionState({ questions });

  const send = useCallback(async () => {
    if (sending || !hasAllAnswers) return;
    const response = buildResponse();
    if (!response) return;
    setSending(true);
    void haptic.light();
    try {
      await getClient()
        .mutation(SEND_SESSION_MESSAGE_MUTATION, {
          sessionId,
          text: response,
          interactionMode: hasActivePlan ? "plan" : undefined,
        })
        .toPromise();
    } finally {
      setSending(false);
      onClose();
    }
  }, [buildResponse, hasActivePlan, hasAllAnswers, onClose, sending, sessionId]);

  const continueFlow = () => {
    if (!currentValid) return;
    if (isLastPage) setReviewing(true);
    else goNext();
  };
  const type = question.type ?? (question.multiSelect ? "multi-select" : "single-select");
  const step = total > 1 ? `${page + 1} of ${total}` : "Question";

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
        <Glass preset="card" interactive style={[styles.header, { borderColor: alpha(theme.colors.foreground, 0.12), borderWidth: StyleSheet.hairlineWidth }]}>
          <Pressable onPress={onClose} hitSlop={8}><Text variant="subheadline" color="foreground">Cancel</Text></Pressable>
          <View style={styles.headerTitle}><Text variant="subheadline" color="foreground" align="center">Question</Text><Text variant="caption2" color="mutedForeground" align="center">Trace</Text></View>
          <Text variant="caption1" color="mutedForeground">{reviewing ? `${total} answers` : step}</Text>
        </Glass>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {reviewing ? (
            <Review questions={questions} answers={answers} onEdit={(index) => { setPage(index); setReviewing(false); }} />
          ) : (
            <>
              <View style={styles.prompt}>
                <View style={[styles.statusDot, { backgroundColor: validationMessage ? theme.colors.destructive : theme.colors.warning }]} />
                <Text variant="caption1" color={validationMessage ? "destructive" : "mutedForeground"}>
                  {validationMessage ? "Needs attention" : question.header || "Answer the agent"}
                </Text>
                <Text variant="title2" color="foreground" style={styles.title}>{question.question}</Text>
                {question.context ? <Text variant="body" color="mutedForeground">{question.context}</Text> : null}
              </View>
              <QuestionControl
                question={question}
                type={type}
                selected={currentSelected}
                custom={currentCustom}
                ranking={currentRanking}
                onToggle={toggleOption}
                onCustom={setCustomText}
                onMove={moveRankOption}
              />
              {validationMessage ? <Text variant="caption1" color="destructive" style={styles.error}>{validationMessage}</Text> : null}
              <Pressable onPress={decideForMe} style={styles.decide}><Text variant="subheadline" color="mutedForeground">You decide</Text></Pressable>
            </>
          )}
        </ScrollView>
        <Glass preset="pinnedBar" interactive style={[styles.footer, { borderTopColor: theme.colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: Math.max(14, insets.bottom) }]}>
          {!reviewing && !isFirstPage ? <Pressable onPress={goPrev} style={styles.back}><Text variant="subheadline" color="mutedForeground">Back</Text></Pressable> : null}
          <Pressable
            disabled={sending || (reviewing ? !hasAllAnswers : !currentValid)}
            onPress={() => { if (reviewing) void send(); else continueFlow(); }}
            style={({ pressed }) => [styles.primary, { backgroundColor: theme.colors.accent, opacity: sending || (reviewing ? !hasAllAnswers : !currentValid) ? 0.42 : pressed ? 0.8 : 1 }]}
          >
            <Text variant="body" color="accentForeground" align="center" style={styles.primaryText}>
              {sending ? "Sending…" : reviewing ? `Send ${total} answer${total === 1 ? "" : "s"}` : isLastPage ? "Review answers" : "Continue"}
            </Text>
          </Pressable>
        </Glass>
    </View>
  );
}

function QuestionControl({ question, type, selected, custom, ranking, onToggle, onCustom, onMove }: {
  question: Question; type: string; selected: ReadonlySet<string>; custom: string; ranking: readonly string[];
  onToggle: (value: string) => void; onCustom: (value: string) => void; onMove: (value: string, direction: -1 | 1) => void;
}) {
  const theme = useTheme();
  if (type === "text" || type === "reference") return (
    <View style={styles.control}>
      <TextInput value={custom} onChangeText={onCustom} multiline maxLength={question.maxLength} placeholder={question.placeholder ?? (type === "reference" ? "Paste a reference URL" : "Type your answer…")} placeholderTextColor={theme.colors.dimForeground} style={[styles.textInput, { color: theme.colors.foreground, borderColor: alpha(theme.colors.accent, 0.55), backgroundColor: theme.colors.surface }]} />
      {question.suggestions?.map((suggestion) => <Pressable key={suggestion} onPress={() => onCustom(suggestion)} style={[styles.suggestion, { borderColor: theme.colors.border }]}><Text variant="caption1" color="mutedForeground">{suggestion}</Text></Pressable>)}
    </View>
  );
  if (type === "ranking") return <View style={styles.control}>{ranking.map((value, index) => <View key={value} style={[styles.rankRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}><Text variant="subheadline" color="foreground" style={styles.rankNumber}>{index + 1}</Text><Text variant="subheadline" color="foreground" style={styles.rankLabel}>{question.options.find((option) => (option.id ?? option.label) === value)?.label ?? value}</Text><Pressable disabled={index === 0} onPress={() => onMove(value, -1)}><Text variant="title2" color="mutedForeground">↑</Text></Pressable><Pressable disabled={index === ranking.length - 1} onPress={() => onMove(value, 1)}><Text variant="title2" color="mutedForeground">↓</Text></Pressable></View>)}</View>;
  const options = type === "confirm" && question.options.length === 0 ? [{ id: "yes", label: "Yes", description: "Continue" }, { id: "no", label: "No", description: "Not yet" }] : question.options;
  const multi = type === "multi-select";
  return <View style={styles.control}>
    {question.min != null || question.max != null ? <Text variant="caption1" color="mutedForeground">{selected.size} selected{question.min != null ? ` · choose at least ${question.min}` : ""}</Text> : null}
    <View style={type === "confirm" ? styles.confirmGrid : styles.optionList}>
      {options.map((option) => <Option key={option.id ?? option.label} option={option} selected={selected.has(option.id ?? option.label)} multi={multi} onPress={() => onToggle(option.id ?? option.label)} />)}
      {(type === "select-with-other" || question.other) ? <Option option={{ id: "other", label: "Something else", description: "Write a different answer" }} selected={selected.has("other")} multi={false} onPress={() => onToggle("other")} /> : null}
    </View>
    {(type === "select-with-other" || question.other) && selected.has("other") ? <TextInput value={custom} onChangeText={onCustom} multiline placeholder="Write your own answer…" placeholderTextColor={theme.colors.dimForeground} style={[styles.otherInput, { color: theme.colors.foreground, borderColor: alpha(theme.colors.accent, 0.55), backgroundColor: theme.colors.surface }]} /> : null}
  </View>;
}

function Option({ option, selected, multi, onPress }: { option: { id?: string; label: string; description: string }; selected: boolean; multi: boolean; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.option, { borderColor: selected ? theme.colors.accent : theme.colors.border, backgroundColor: selected ? alpha(theme.colors.accent, 0.14) : theme.colors.surface, opacity: pressed ? 0.8 : 1 }]}><View style={styles.optionCopy}><Text variant="body" color="foreground">{option.label}</Text>{option.description ? <Text variant="caption1" color="mutedForeground">{option.description}</Text> : null}</View><View style={[styles.mark, { borderColor: selected ? theme.colors.accent : theme.colors.mutedForeground, borderRadius: multi ? 5 : 99, backgroundColor: selected ? theme.colors.accent : "transparent" }]}>{selected ? <Text variant="caption2" color="accentForeground">✓</Text> : null}</View></Pressable>;
}

function Review({ questions, answers, onEdit }: { questions: Question[]; answers: ReturnType<typeof useQuestionState>["answers"]; onEdit: (index: number) => void }) {
  const theme = useTheme();
  return <View><Text variant="title2" color="foreground">Ready to send your answers?</Text><Text variant="body" color="mutedForeground" style={styles.reviewIntro}>Check each response before resuming the session.</Text><View style={[styles.reviewList, { borderColor: theme.colors.border }]}>{questions.map((question, index) => <View key={question.id ?? String(index)} style={[styles.reviewRow, { borderBottomColor: theme.colors.border }]}><View style={styles.reviewCopy}><Text variant="caption1" color="mutedForeground">{question.header || `Question ${index + 1}`}</Text><Text variant="subheadline" color="foreground">{answers[index]?.custom || [...(answers[index]?.selected ?? [])].join(" · ") || answers[index]?.ranking.join(" · ") || "You decide"}</Text></View><Pressable onPress={() => onEdit(index)}><Text variant="subheadline" color="mutedForeground">Edit</Text></Pressable></View>)}</View></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, header: { marginHorizontal: 12, marginTop: 12, minHeight: 54, borderRadius: 28, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, headerTitle: { position: "absolute", left: 84, right: 84, alignItems: "center" }, content: { paddingHorizontal: 16, paddingTop: 28, paddingBottom: 24 }, prompt: { gap: 10 }, statusDot: { width: 8, height: 8, borderRadius: 4 }, title: { fontWeight: "700", fontSize: 28, lineHeight: 34 }, control: { marginTop: 28, gap: 12 }, optionList: { gap: 12 }, confirmGrid: { flexDirection: "row", gap: 12 }, option: { minHeight: 62, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }, optionCopy: { flex: 1, gap: 3 }, mark: { width: 24, height: 24, borderWidth: 1, alignItems: "center", justifyContent: "center" }, textInput: { minHeight: 144, borderWidth: 1, borderRadius: 16, padding: 14, fontSize: 16, textAlignVertical: "top" }, otherInput: { minHeight: 96, borderWidth: 1, borderRadius: 16, padding: 14, fontSize: 16, textAlignVertical: "top" }, suggestion: { alignSelf: "flex-start", minHeight: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, paddingHorizontal: 14, justifyContent: "center" }, error: { marginTop: 14 }, decide: { marginTop: 16, alignSelf: "flex-start", minHeight: 44, justifyContent: "center" }, rankRow: { minHeight: 62, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 12, flexDirection: "row", gap: 12, alignItems: "center" }, rankNumber: { width: 26, textAlign: "center" }, rankLabel: { flex: 1 }, footer: { minHeight: 84, paddingHorizontal: 16, paddingTop: 14, flexDirection: "row", alignItems: "center", gap: 12 }, back: { minHeight: 52, justifyContent: "center", paddingHorizontal: 8 }, primary: { flex: 1, minHeight: 52, borderRadius: 26, justifyContent: "center", paddingHorizontal: 20 }, primaryText: { fontWeight: "700" }, reviewIntro: { marginTop: 10 }, reviewList: { marginTop: 24, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, overflow: "hidden" }, reviewRow: { minHeight: 70, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth }, reviewCopy: { flex: 1, gap: 4 },
});
