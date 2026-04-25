import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { SEND_SESSION_MESSAGE_MUTATION } from "@trace/client-core";
import { Text } from "@/components/design-system";
import { startPlanImplementationSession } from "@/lib/createQuickSession";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";
import {
  PendingInputSendButton,
  PendingInputShell,
  pendingInputStyles,
} from "./PendingInputShell";

interface PendingInputPlanProps {
  sessionId: string;
  planContent: string;
  planFilePath: string;
}

const APPROVE_TEXT = "Approved. Implement this plan.";

type PlanAction = "new-session" | "same-session" | "type-more";

const PLAN_OPTIONS: Array<{
  value: PlanAction;
  title: string;
  description: string;
}> = [
  {
    value: "new-session",
    title: "Start a new session",
    description: "Primary. Implement this plan in a fresh session.",
  },
  {
    value: "same-session",
    title: "Continue on this session",
    description: "Approve the plan and keep the current context.",
  },
  {
    value: "type-more",
    title: "Type more",
    description: "Ask for changes or add more direction before implementation.",
  },
];

/**
 * Mobile plan-review surface matching web's option set while using large,
 * full-width radio rows that are easy to tap: start a fresh session,
 * continue in the current one, or type more feedback in plan mode.
 */
export function PendingInputPlan({
  sessionId,
  planContent,
  planFilePath,
}: PendingInputPlanProps) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [selectedAction, setSelectedAction] = useState<PlanAction>("new-session");
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);

  const filename = planFilePath ? planFilePath.split("/").pop() : null;
  const trimmed = feedback.trim();
  const isTypingMore = selectedAction === "type-more";
  const hasAnswer = selectedAction !== "type-more" || trimmed.length > 0;

  useEffect(() => {
    if (!isTypingMore) return;
    const timeout = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timeout);
  }, [isTypingMore]);

  const handleStartNewSession = useCallback(async () => {
    if (sending) return;
    setSending(true);
    try {
      const started = await startPlanImplementationSession(sessionId, planContent);
      if (started) {
        setFeedback("");
        setSelectedAction("new-session");
      }
    } finally {
      setSending(false);
    }
  }, [planContent, sending, sessionId]);

  const handleKeepContext = useCallback(async () => {
    if (sending) return;
    setSending(true);
    void haptic.success();
    try {
      await getClient()
        .mutation(SEND_SESSION_MESSAGE_MUTATION, {
          sessionId,
          text: APPROVE_TEXT,
        })
        .toPromise();
      setFeedback("");
      setSelectedAction("new-session");
    } finally {
      setSending(false);
    }
  }, [sending, sessionId]);

  const handleRevise = useCallback(async () => {
    if (sending || !trimmed) return;
    setSending(true);
    void haptic.light();
    try {
      await getClient()
        .mutation(SEND_SESSION_MESSAGE_MUTATION, {
          sessionId,
          text: `Please revise the plan: ${trimmed}`,
          interactionMode: "plan",
        })
        .toPromise();
      setFeedback("");
      setSelectedAction("new-session");
    } finally {
      setSending(false);
    }
  }, [sending, sessionId, trimmed]);

  const handleSend = useCallback(() => {
    if (selectedAction === "new-session") {
      void handleStartNewSession();
      return;
    }
    if (selectedAction === "same-session") {
      void handleKeepContext();
      return;
    }
    void handleRevise();
  }, [handleKeepContext, handleRevise, handleStartNewSession, selectedAction]);

  const headerTrailing = filename ? (
    <Text
      variant="caption2"
      color="mutedForeground"
      numberOfLines={1}
      style={styles.filename}
    >
      {filename}
    </Text>
  ) : null;

  return (
    <PendingInputShell header="Plan Review" headerTrailing={headerTrailing}>
      <View style={styles.optionsColumn}>
        {PLAN_OPTIONS.map((option) => {
          const selected = selectedAction === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.title}
              accessibilityState={{ checked: selected, disabled: sending }}
              disabled={sending}
              onPress={() => {
                void haptic.selection();
                setSelectedAction(option.value);
              }}
              style={({ pressed }) => [
                styles.optionButton,
                {
                  borderColor: selected ? theme.colors.accent : theme.colors.border,
                  backgroundColor: selected
                    ? alpha(theme.colors.accent, 0.16)
                    : pressed
                      ? theme.colors.surfaceElevated
                      : theme.colors.surfaceDeep,
                  opacity: sending ? 0.5 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.radioOuter,
                  {
                    borderColor: selected ? theme.colors.accent : theme.colors.border,
                    backgroundColor: selected
                      ? alpha(theme.colors.accent, 0.12)
                      : "transparent",
                  },
                ]}
              >
                {selected ? (
                  <View
                    style={[
                      styles.radioInner,
                      { backgroundColor: theme.colors.accent },
                    ]}
                  />
                ) : null}
              </View>
              <View style={styles.optionCopy}>
                <Text
                  variant="body"
                  style={[
                    styles.optionTitle,
                    { color: selected ? theme.colors.foreground : theme.colors.foreground },
                  ]}
                >
                  {option.title}
                </Text>
                <Text variant="footnote" color="mutedForeground" style={styles.optionDescription}>
                  {option.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {isTypingMore ? (
        <View style={pendingInputStyles.bottomRow}>
          <TextInput
            ref={inputRef}
            value={feedback}
            onChangeText={setFeedback}
            onSubmitEditing={() => {
              if (trimmed) handleSend();
            }}
            placeholder="Describe what should change in the plan…"
            placeholderTextColor={theme.colors.dimForeground}
            editable={!sending}
            returnKeyType="send"
            multiline
            textAlignVertical="top"
            style={[
              pendingInputStyles.input,
              styles.feedbackInput,
              {
                backgroundColor: theme.colors.surfaceDeep,
                borderColor: theme.colors.border,
                color: theme.colors.foreground,
              },
            ]}
          />
          <PendingInputSendButton
            enabled={hasAnswer}
            loading={sending}
            accessibilityLabel="Send plan feedback"
            onPress={handleSend}
          />
        </View>
      ) : (
        <View style={styles.actionRow}>
          <PendingInputSendButton
            enabled={hasAnswer}
            loading={sending}
            accessibilityLabel={
              selectedAction === "new-session"
                ? "Start a new session"
                : "Continue on this session"
            }
            onPress={handleSend}
          />
        </View>
      )}
    </PendingInputShell>
  );
}

const styles = StyleSheet.create({
  filename: { marginLeft: "auto", maxWidth: "55%", fontFamily: "Menlo" },
  optionsColumn: {
    gap: 8,
    marginTop: 10,
  },
  optionButton: {
    width: "100%",
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionCopy: {
    flex: 1,
    gap: 2,
  },
  optionTitle: {
    fontWeight: "700",
  },
  optionDescription: {
    lineHeight: 18,
  },
  feedbackInput: {
    minHeight: 92,
    paddingTop: 10,
  },
  actionRow: {
    marginTop: 12,
    alignItems: "flex-end",
  },
});
