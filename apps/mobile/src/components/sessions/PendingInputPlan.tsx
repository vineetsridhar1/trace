import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { SEND_SESSION_MESSAGE_MUTATION } from "@trace/client-core";
import { Glass, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { getClient } from "@/lib/urql";
import { alpha, useTheme } from "@/theme";

interface PendingInputPlanProps {
  sessionId: string;
  planContent: string;
  planFilePath: string;
  /**
   * Focus the main composer with the prefilled feedback prompt. Wired by
   * the composer in ticket 23. When omitted the button still renders but
   * is a no-op.
   */
  onRequestFeedback?: (prefill: string) => void;
}

const ACCEPT_TEXT = "Approved. Implement this plan.";
const FEEDBACK_PREFILL = "Feedback on plan: ";

/**
 * Plan variant of the pending-input bar. Compact card with the plan's
 * filename + a one-line preview, plus Accept (sends approval text) and
 * Send feedback (focuses the composer with a prefilled prefix).
 */
export function PendingInputPlan({
  sessionId,
  planContent,
  planFilePath,
  onRequestFeedback,
}: PendingInputPlanProps) {
  const theme = useTheme();
  const [sending, setSending] = useState(false);

  const handleAccept = useCallback(async () => {
    if (sending) return;
    setSending(true);
    void haptic.success();
    try {
      await getClient()
        .mutation(SEND_SESSION_MESSAGE_MUTATION, {
          sessionId,
          text: ACCEPT_TEXT,
        })
        .toPromise();
    } finally {
      setSending(false);
    }
  }, [sending, sessionId]);

  const handleFeedback = useCallback(() => {
    void haptic.light();
    onRequestFeedback?.(FEEDBACK_PREFILL);
  }, [onRequestFeedback]);

  const filename = planFilePath ? planFilePath.split("/").pop() : null;
  const preview = previewText(planContent);

  return (
    <Glass
      preset="pinnedBar"
      style={{
        marginHorizontal: theme.spacing.md,
        marginBottom: theme.spacing.sm,
        borderColor: alpha(theme.colors.statusMerged, 0.32),
        borderWidth: StyleSheet.hairlineWidth,
        padding: theme.spacing.md,
      }}
    >
      <View style={styles.header}>
        <SymbolView
          name="map.fill"
          size={14}
          tintColor={theme.colors.statusMerged}
          resizeMode="scaleAspectFit"
          style={styles.headerIcon}
        />
        <Text
          variant="caption2"
          style={{
            color: theme.colors.statusMerged,
            fontWeight: "700",
            letterSpacing: 0.4,
          }}
        >
          PLAN READY FOR REVIEW
        </Text>
        {filename ? (
          <Text
            variant="caption2"
            color="mutedForeground"
            numberOfLines={1}
            style={styles.filename}
          >
            {filename}
          </Text>
        ) : null}
      </View>

      {preview ? (
        <Text
          variant="footnote"
          color="mutedForeground"
          style={styles.preview}
          numberOfLines={2}
        >
          {preview}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Accept plan"
          disabled={sending}
          onPress={() => void handleAccept()}
          style={({ pressed }) => [
            styles.acceptButton,
            {
              backgroundColor: pressed
                ? alpha(theme.colors.statusMerged, 0.85)
                : theme.colors.statusMerged,
              opacity: sending ? 0.6 : 1,
            },
          ]}
        >
          <Text variant="footnote" color="accentForeground" style={styles.acceptLabel}>
            Accept
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send feedback on plan"
          disabled={sending}
          onPress={handleFeedback}
          style={({ pressed }) => [
            styles.feedbackButton,
            {
              borderColor: alpha(theme.colors.statusMerged, 0.4),
              backgroundColor: pressed
                ? alpha(theme.colors.statusMerged, 0.12)
                : "transparent",
            },
          ]}
        >
          <Text variant="footnote" color="foreground" style={styles.feedbackLabel}>
            Send feedback
          </Text>
        </Pressable>
      </View>
    </Glass>
  );
}

function previewText(content: string): string {
  // First non-empty line, with markdown headers stripped.
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/^#+\s*/, "").trim();
    if (line) return line;
  }
  return "";
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerIcon: { width: 14, height: 14 },
  filename: { marginLeft: "auto", maxWidth: "55%" },
  preview: { marginTop: 6 },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  acceptButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  acceptLabel: { fontWeight: "600" },
  feedbackButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  feedbackLabel: { fontWeight: "500" },
});
