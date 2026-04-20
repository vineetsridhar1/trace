import { memo, useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { SegmentedControl, Text } from "@/components/design-system";
import { useChannelSessionGroupCounts } from "@/hooks/useChannelSessionGroups";
import { useTheme } from "@/theme";
import type { ActiveSegment } from "@/hooks/useChannelSessionGroups";

const SEGMENTS: ActiveSegment[] = ["all", "mine"];
const SEGMENT_LABELS = ["All", "Mine"];

export interface SessionGroupsHeaderProps {
  channelId: string;
  segment: ActiveSegment;
  onSegmentChange: (segment: ActiveSegment) => void;
}

export const SessionGroupsHeader = memo(function SessionGroupsHeader({
  channelId,
  segment,
  onSegmentChange,
}: SessionGroupsHeaderProps) {
  const theme = useTheme();
  const counts = useChannelSessionGroupCounts(channelId);

  const subtitle = useMemo(
    () => formatSubtitle(counts.active, counts.needsInput),
    [counts.active, counts.needsInput],
  );

  const selectedIndex = SEGMENTS.indexOf(segment);

  const handleChange = useCallback(
    (index: number) => {
      const next = SEGMENTS[index];
      if (next) onSegmentChange(next);
    },
    [onSegmentChange],
  );

  return (
    <View
      style={[
        styles.container,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.md,
          backgroundColor: theme.colors.background,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <SegmentedControl
        segments={SEGMENT_LABELS}
        selectedIndex={Math.max(0, selectedIndex)}
        onChange={handleChange}
      />
      {subtitle ? (
        <Text variant="caption1" color="mutedForeground" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
});

function formatSubtitle(active: number, needsInput: number): string {
  const activePart = active === 1 ? "1 active" : `${active} active`;
  if (needsInput === 0) return activePart;
  const needsPart = needsInput === 1 ? "1 needs input" : `${needsInput} need input`;
  return `${activePart} · ${needsPart}`;
}

const styles = StyleSheet.create({
  container: { width: "100%" },
  subtitle: { marginTop: 8, textAlign: "center" },
});
