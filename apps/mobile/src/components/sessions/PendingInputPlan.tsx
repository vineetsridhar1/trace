import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { SEND_SESSION_MESSAGE_MUTATION } from "@trace/client-core";
import { Glass, Text } from "@/components/design-system";
import { startPlanImplementationSession } from "@/lib/createQuickSession";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";
import { PendingInputShell, pendingInputStyles } from "./PendingInputShell";
import { VisualPlanViewer } from "./VisualPlanViewer";
import { SessionComposerActionButton } from "./session-input-composer/SessionComposerActionButton";
import { styles as composerStyles } from "./session-input-composer/styles";
import { gql } from "@urql/core";

interface PendingInputPlanProps {
  sessionId: string;
  planContent: string;
  artifactId?: string;
  visualPlanHtml?: string;
  keyboardVisible?: boolean;
}

const APPROVE_ARTIFACT_MUTATION = gql`
  mutation MobileApproveArtifact(
    $artifactId: ID!
    $action: ArtifactApprovalAction!
    $prompt: String!
  ) {
    approveArtifact(artifactId: $artifactId, action: $action, prompt: $prompt) {
      implementationSession {
        id
      }
    }
  }
`;

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

/** Mobile plan-review surface matching the composer/slash-menu styling. */
export function PendingInputPlan({
  sessionId,
  planContent,
  artifactId,
  visualPlanHtml,
  keyboardVisible = false,
}: PendingInputPlanProps) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [selectedAction, setSelectedAction] = useState<PlanAction | null>("new-session");
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);

  const trimmed = feedback.trim();
  const isTypingMore = trimmed.length > 0;
  const hasAnswer = isTypingMore || selectedAction !== null;
  const approveArtifact = useCallback(
    async (action: "KEEP_CONTEXT", prompt: string) => {
      if (!artifactId) throw new Error("The plan artifact is unavailable");
      const result = await getClient()
        .mutation(APPROVE_ARTIFACT_MUTATION, { artifactId, action, prompt })
        .toPromise();
      if (result.error) throw result.error;
    },
    [artifactId],
  );

  useEffect(() => {
    if (!isTypingMore) return;
    const timeout = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(timeout);
  }, [isTypingMore]);

  const handleStartNewSession = useCallback(async () => {
    if (sending) return;
    setSending(true);
    try {
      if (!artifactId) throw new Error("The plan artifact is unavailable");
      const started = await startPlanImplementationSession(artifactId, planContent);
      if (started) {
        setFeedback("");
        setSelectedAction("new-session");
      }
    } finally {
      setSending(false);
    }
  }, [artifactId, planContent, sending]);

  const handleKeepContext = useCallback(async () => {
    if (sending) return;
    setSending(true);
    void haptic.success();
    try {
      await approveArtifact("KEEP_CONTEXT", "Approved. Implement this plan.");
      setFeedback("");
      setSelectedAction("new-session");
    } finally {
      setSending(false);
    }
  }, [approveArtifact, sending]);

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

  return (
    <PendingInputShell
      header="Plan Review"
      background="transparent"
      showHeader={false}
      showTopBorder={false}
      keyboardVisible={keyboardVisible}
    >
      <View style={[styles.menuContainer, theme.shadows.lg]}>
        <Glass preset="card" interactive style={styles.menuSurface}>
          <View style={styles.menuContent}>
            {visualPlanHtml ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="View visual plan"
                disabled={sending}
                onPress={() => setViewerVisible(true)}
                style={({ pressed }) => [
                  styles.visualPlanButton,
                  {
                    backgroundColor: pressed
                      ? "rgba(255, 255, 255, 0.08)"
                      : "rgba(255, 255, 255, 0.04)",
                  },
                ]}
              >
                <Text variant="subheadline" color="accent">
                  View visual plan
                </Text>
              </Pressable>
            ) : null}
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
                      backgroundColor: selected
                        ? "rgba(255, 255, 255, 0.08)"
                        : pressed
                          ? "rgba(255, 255, 255, 0.05)"
                          : undefined,
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
        <Glass
          preset="input"
          interactive
          style={[
            composerStyles.inputCard,
            styles.feedbackInputCard,
            { borderColor: theme.colors.border },
          ]}
        >
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
            placeholder="Suggest a change"
            placeholderTextColor={theme.colors.dimForeground}
            editable={!sending}
            returnKeyType="send"
            style={[composerStyles.input, styles.feedbackInput, { color: theme.colors.foreground }]}
          />
        </Glass>
        <SessionComposerActionButton
          accessibilityLabel={
            trimmed
              ? "Send plan feedback"
              : selectedAction === "same-session"
                ? "Continue on this session"
                : "Start a new session"
          }
          contentOpacity={hasAnswer && !sending ? 1 : 0.35}
          disabled={!hasAnswer || sending}
          glassStyle={{ borderColor: alpha(theme.colors.success, 0.28) }}
          iconName="paperplane.fill"
          iconSize={16}
          iconTint={theme.colors.accentForeground}
          onPress={handleSend}
          tint={alpha(theme.colors.success, 0.18)}
        />
      </View>
      {visualPlanHtml ? (
        <VisualPlanViewer
          html={visualPlanHtml}
          visible={viewerVisible}
          onClose={() => setViewerVisible(false)}
        />
      ) : null}
    </PendingInputShell>
  );
}

const styles = StyleSheet.create({
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
  visualPlanButton: {
    borderRadius: 8,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  menuCopy: {
    flex: 1,
    gap: 3,
  },
  optionTitle: {
    flexShrink: 1,
  },
  feedbackInput: {
    height: 30,
  },
  feedbackInputCard: {
    flex: 1,
    height: 46,
    justifyContent: "center",
  },
});
