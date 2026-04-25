import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { SEND_SESSION_MESSAGE_MUTATION } from "@trace/client-core";
import { Glass, Text } from "@/components/design-system";
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

type PlanAction = "new-session" | "same-session";

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
  const [selectedAction, setSelectedAction] = useState<PlanAction | null>("new-session");
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);

  const filename = planFilePath ? planFilePath.split("/").pop() : null;
  const trimmed = feedback.trim();
  const isTypingMore = trimmed.length > 0;
  const hasAnswer = isTypingMore || selectedAction !== null;

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
    if (trimmed) {
      void handleRevise();
      return;
    }
    if (selectedAction === "new-session") {
      void handleStartNewSession();
      return;
    }
    if (selectedAction === "same-session") {
      void handleKeepContext();
      return;
    }
  }, [handleKeepContext, handleRevise, handleStartNewSession, selectedAction, trimmed]);

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
      <View style={[styles.menuContainer, theme.shadows.lg]}>
        <Glass preset="card" interactive style={styles.menuSurface}>
          <View style={styles.menuContent}>
            {PLAN_OPTIONS.map((option, index) => {
              const selected = selectedAction === option.value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityLabel={option.title}
                  accessibilityState={{ selected, disabled: sending }}
                  disabled={sending}
                  onPress={() => {
                    void haptic.selection();
                    setSelectedAction(option.value);
                    setFeedback("");
                  }}
                  style={({ pressed }) => [
                    styles.menuRow,
                    {
                      marginBottom: index < PLAN_OPTIONS.length - 1 ? 2 : 0,
                      backgroundColor: pressed ? "rgb(255, 255, 255, 0.05)" : undefined,
                      opacity: sending ? 0.5 : 1,
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
                      {option.title}
                    </Text>
                    <Text
                      variant="caption1"
                      numberOfLines={2}
                      style={{ color: alpha(theme.colors.foreground, 0.88) }}
                    >
                      {option.description}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Glass>
      </View>

      <View style={pendingInputStyles.bottomRow}>
        <TextInput
          ref={inputRef}
          value={feedback}
          onChangeText={(text) => {
            setFeedback(text);
            setSelectedAction(text.trim().length > 0 ? null : "new-session");
          }}
          onFocus={() => {
            if (!feedback.trim()) setSelectedAction(null);
          }}
          onSubmitEditing={() => {
            if (hasAnswer) handleSend();
          }}
          placeholder="Type more…"
          placeholderTextColor={theme.colors.dimForeground}
          editable={!sending}
          returnKeyType="send"
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
          accessibilityLabel={
            trimmed
              ? "Send plan feedback"
              : selectedAction === "same-session"
                ? "Continue on this session"
                : "Start a new session"
          }
          onPress={handleSend}
        />
      </View>
    </PendingInputShell>
  );
}

const styles = StyleSheet.create({
  filename: { marginLeft: "auto", maxWidth: "55%", fontFamily: "Menlo" },
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
  feedbackInput: {
    minHeight: 36,
  },
});
