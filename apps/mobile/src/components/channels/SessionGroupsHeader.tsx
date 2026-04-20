import { memo, useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useEntityField } from "@trace/client-core";
import { Glass, SegmentedControl, Text } from "@/components/design-system";
import { useChannelSessionGroupCounts } from "@/hooks/useChannelSessionGroups";
import { useTheme } from "@/theme";
import type { SessionGroupSegment } from "@/hooks/useChannelSessionGroups";

const SEGMENTS: SessionGroupSegment[] = ["active", "merged", "archived"];
const SEGMENT_LABELS = ["Active", "Merged", "Archived"];

export interface SessionGroupsHeaderProps {
  channelId: string;
  segment: SessionGroupSegment;
  onSegmentChange: (segment: SessionGroupSegment) => void;
}

export const SessionGroupsHeader = memo(function SessionGroupsHeader({
  channelId,
  segment,
  onSegmentChange,
}: SessionGroupsHeaderProps) {
  const theme = useTheme();
  const channelName = useEntityField("channels", channelId, "name");
  const counts = useChannelSessionGroupCounts(channelId);

  const subtitle = useMemo(() => formatSubtitle(counts.active, counts.needsInput), [
    counts.active,
    counts.needsInput,
  ]);

  const selectedIndex = SEGMENTS.indexOf(segment);

  const handleChange = useCallback(
    (index: number) => {
      const next = SEGMENTS[index];
      if (next) onSegmentChange(next);
    },
    [onSegmentChange],
  );

  return (
    <Glass preset="card" style={styles.container}>
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          paddingBottom: theme.spacing.md,
          gap: theme.spacing.md,
        }}
      >
        {channelName ? (
          <View>
            <Text variant="title2" color="foreground" numberOfLines={1}>
              {channelName}
            </Text>
            <Text variant="footnote" color="mutedForeground" style={styles.subtitle}>
              {subtitle}
            </Text>
          </View>
        ) : null}
        <SegmentedControl
          segments={SEGMENT_LABELS}
          selectedIndex={Math.max(0, selectedIndex)}
          onChange={handleChange}
        />
      </View>
    </Glass>
  );
});

function formatSubtitle(active: number, needsInput: number): string {
  const activePart =
    active === 1 ? "1 active" : `${active} active`;
  const needsPart =
    needsInput === 1 ? "1 needs input" : `${needsInput} need input`;
  return `${activePart} · ${needsPart}`;
}

const styles = StyleSheet.create({
  container: { width: "100%" },
  subtitle: { marginTop: 2 },
});
