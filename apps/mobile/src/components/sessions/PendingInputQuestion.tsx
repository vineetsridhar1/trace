import { useCallback, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import {
  SEND_SESSION_MESSAGE_MUTATION,
  useQuestionState,
} from "@trace/client-core";
import type { Question } from "@trace/shared";
import { Glass, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";
import {
  PendingInputPagerButton,
  PendingInputShell,
  pendingInputStyles,
} from "./PendingInputShell";
import { SessionComposerActionButton } from "./session-input-composer/SessionComposerActionButton";
import { styles as composerStyles } from "./session-input-composer/styles";

interface PendingInputQuestionProps {
  sessionId: string;
  questions: Question[];
  keyboardVisible?: boolean;
  /**
   * True when an earlier assistant event in the session is a plan block.
   * When set, the response is sent with `interactionMode: "plan"` so the
   * agent stays in plan mode — matches web's `AskUserQuestionBar` usage.
   */
  hasActivePlan: boolean;
}

/**
 * Question variant of the pending-input bar. Mirrors web's
 * `AskUserQuestionBar`: option pills toggle a per-question selection
 * without sending, an inline "Other…" input collects free-form text,
 * pagination chevrons navigate multi-question payloads, and Send fires
 * only after every question has an answer (built into a single combined
 * `{header}: {answer}` message via `useQuestionState.buildResponse`).
 */
export function PendingInputQuestion({
  sessionId,
  questions,
  hasActivePlan,
  keyboardVisible = false,
}: PendingInputQuestionProps) {
  const theme = useTheme();
  const {
    page,
    total,
    question,
    currentSelected,
    currentCustom,
    isFirstPage,
    isLastPage,
    hasAllAnswers,
    toggleOption,
    setCustomText,
    goNext,
    goPrev,
    buildResponse,
  } = useQuestionState({ questions });

  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
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
    }
  }, [buildResponse, hasActivePlan, hasAllAnswers, sending, sessionId]);

  const handleSubmit = () => {
    if (hasAllAnswers) void handleSend();
    else if (!isLastPage) goNext();
  };

  const headerTrailing =
    total > 1 ? (
      <Text variant="caption2" color="mutedForeground">
        {page + 1}/{total}
      </Text>
    ) : null;

  return (
    <PendingInputShell
      header={question.header || "Question"}
      headerTrailing={headerTrailing}
      background="transparent"
      showHeader={false}
      showTopBorder={false}
      keyboardVisible={keyboardVisible}
    >
      <Text
        variant="footnote"
        color="foreground"
        style={styles.questionText}
        numberOfLines={4}
      >
        {question.question}
      </Text>

      {question.options.length > 0 ? (
        <View style={[styles.menuContainer, theme.shadows.lg]}>
          <Glass preset="card" interactive style={styles.menuSurface}>
            <View style={styles.menuContent}>
              {question.options.map((opt, index) => {
                const selected = currentSelected.has(opt.label);
                return (
                  <Pressable
                    key={opt.label}
                    accessibilityRole="button"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      void haptic.selection();
                      toggleOption(opt.label);
                    }}
                    style={({ pressed }) => [
                      styles.menuRow,
                      {
                        marginBottom: index < question.options.length - 1 ? 2 : 0,
                        backgroundColor: pressed ? "rgb(255, 255, 255, 0.05)" : undefined,
                      },
                    ]}
                  >
                    <View style={styles.menuCopy}>
                      <Text
                        variant="subheadline"
                        numberOfLines={1}
                        color={selected ? "accent" : "foreground"}
                        style={styles.optionTitle}
                      >
                        {opt.label}
                      </Text>
                      <Text
                        variant="caption1"
                        numberOfLines={2}
                        style={{ color: alpha(theme.colors.foreground, 0.88) }}
                      >
                        {opt.description}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Glass>
        </View>
      ) : null}

      <View style={pendingInputStyles.bottomRow}>
        <Glass
          preset="input"
          interactive
          style={[
            composerStyles.inputCard,
            styles.customInputCard,
            {
              borderColor: theme.colors.border,
            },
          ]}
        >
          <TextInput
            value={currentCustom}
            onChangeText={setCustomText}
            onSubmitEditing={handleSubmit}
            placeholder="Suggest a change"
            placeholderTextColor={theme.colors.dimForeground}
            editable={!sending}
            returnKeyType={hasAllAnswers ? "send" : "next"}
            style={[
              composerStyles.input,
              styles.customInput,
              { color: theme.colors.foreground },
            ]}
          />
        </Glass>
        {total > 1 ? (
          <View style={styles.pager}>
            <PendingInputPagerButton
              icon="chevron.left"
              accessibilityLabel="Previous question"
              disabled={isFirstPage || sending}
              onPress={goPrev}
            />
            <PendingInputPagerButton
              icon="chevron.right"
              accessibilityLabel="Next question"
              disabled={isLastPage || sending}
              onPress={goNext}
            />
          </View>
        ) : null}
        <SessionComposerActionButton
          accessibilityLabel="Send answer"
          contentOpacity={hasAllAnswers && !sending ? 1 : 0.35}
          disabled={!hasAllAnswers || sending}
          glassStyle={{ borderColor: alpha(theme.colors.success, 0.28) }}
          iconName="paperplane.fill"
          iconSize={16}
          iconTint={theme.colors.accentForeground}
          onPress={() => void handleSend()}
          tint={alpha(theme.colors.success, 0.18)}
        />
      </View>
    </PendingInputShell>
  );
}

const styles = StyleSheet.create({
  questionText: { marginTop: 4, marginBottom: 10 },
  menuContainer: {
    marginTop: 10,
  },
  menuSurface: {
    borderRadius: 20,
    overflow: "hidden",
  },
  menuContent: {
    padding: 6,
  },
  menuRow: {
    minHeight: 56,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  menuCopy: {
    flex: 1,
    gap: 3,
  },
  optionTitle: {
    flexShrink: 1,
  },
  customInputCard: {
    flex: 1,
    height: 46,
    justifyContent: "center",
  },
  customInput: {
    height: 30,
  },
  pager: { flexDirection: "row", gap: 4 },
});
