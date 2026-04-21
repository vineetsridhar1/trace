import { StyleSheet } from "react-native";
import { Card, Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import { Markdown } from "./Markdown";

interface PlanReviewCardProps {
  planContent: string;
  planFilePath: string;
}

/**
 * Plan-review node. Displays the plan content verbatim; the accept/reject
 * affordance ships with ticket 22's pending-input bar, so this component
 * intentionally exposes no actions.
 */
export function PlanReviewCard({ planContent, planFilePath }: PlanReviewCardProps) {
  const theme = useTheme();
  return (
    <Card
      padding="md"
      elevation="low"
      style={{
        ...styles.card,
        backgroundColor: alpha(theme.colors.statusMerged, 0.08),
        borderColor: alpha(theme.colors.statusMerged, 0.3),
        borderWidth: StyleSheet.hairlineWidth,
      }}
    >
      <Text variant="footnote" style={{ color: theme.colors.statusMerged, fontWeight: "700" }}>
        Plan Review
      </Text>
      {planFilePath ? (
        <Text variant="caption2" color="mutedForeground" numberOfLines={1}>
          {planFilePath}
        </Text>
      ) : null}
      <Markdown>{planContent || "(empty plan)"}</Markdown>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    gap: 6,
  },
});
