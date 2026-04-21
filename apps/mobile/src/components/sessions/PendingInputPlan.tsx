import { useCallback, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { SEND_SESSION_MESSAGE_MUTATION } from "@trace/client-core";
import { Text } from "@/components/design-system";
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
const APPROVE_PRESET = "Approve";

/**
 * Plan variant of the pending-input bar. Mirrors web's `PlanResponseBar`:
 * an Approve preset toggle + an inline revise input share one Send button
 * that fires either the approval text or `Please revise the plan: …`
 * (with `interactionMode: "plan"`) depending on which input has content.
 */
export function PendingInputPlan({
  sessionId,
  planContent: _planContent,
  planFilePath,
}: PendingInputPlanProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);

  const filename = planFilePath ? planFilePath.split("/").pop() : null;
  const trimmed = feedback.trim();
  const hasAnswer = selected || trimmed.length > 0;

  const dispatch = useCallback(
    async (text: string, interactionMode?: string) => {
      if (sending) return;
      setSending(true);
      void haptic.light();
      try {
        await getClient()
          .mutation(SEND_SESSION_MESSAGE_MUTATION, {
            sessionId,
            text,
            interactionMode,
          })
          .toPromise();
        setFeedback("");
        setSelected(false);
      } finally {
        setSending(false);
      }
    },
    [sending, sessionId],
  );

  const handleSend = useCallback(() => {
    if (selected && !trimmed) {
      void dispatch(APPROVE_TEXT);
    } else if (trimmed) {
      void dispatch(`Please revise the plan: ${trimmed}`, "plan");
    }
  }, [dispatch, selected, trimmed]);

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
      <View style={styles.presetsRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={APPROVE_PRESET}
          accessibilityState={{ selected }}
          disabled={sending}
          onPress={() => {
            void haptic.selection();
            setSelected((s) => !s);
            if (!selected) setFeedback("");
          }}
          style={({ pressed }) => [
            styles.presetButton,
            {
              borderColor: selected ? theme.colors.accent : theme.colors.border,
              backgroundColor: selected
                ? alpha(theme.colors.accent, 0.18)
                : pressed
                  ? theme.colors.surfaceElevated
                  : "transparent",
              opacity: sending ? 0.5 : 1,
            },
          ]}
        >
          <Text
            variant="footnote"
            style={{
              color: selected ? theme.colors.accent : theme.colors.mutedForeground,
              fontWeight: "500",
            }}
          >
            {APPROVE_PRESET}
          </Text>
        </Pressable>
      </View>

      <View style={pendingInputStyles.bottomRow}>
        <TextInput
          value={feedback}
          onChangeText={(text) => {
            setFeedback(text);
            if (text) setSelected(false);
          }}
          onSubmitEditing={handleSend}
          placeholder="Suggest changes to revise the plan…"
          placeholderTextColor={theme.colors.dimForeground}
          editable={!sending}
          returnKeyType="send"
          style={[
            pendingInputStyles.input,
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
          accessibilityLabel={selected && !trimmed ? "Approve plan" : "Send feedback"}
          onPress={handleSend}
        />
      </View>
    </PendingInputShell>
  );
}

const styles = StyleSheet.create({
  filename: { marginLeft: "auto", maxWidth: "55%", fontFamily: "Menlo" },
  presetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 10,
  },
  presetButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
});
