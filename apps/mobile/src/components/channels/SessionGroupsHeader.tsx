import { memo, useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { SegmentedControl } from "@/components/design-system";
import { useTheme } from "@/theme";
import type { ActiveSegment } from "@/hooks/useChannelSessionGroups";

const SEGMENTS: ActiveSegment[] = ["all", "mine"];
const SEGMENT_LABELS = ["All", "Mine"];

export interface SessionGroupsHeaderProps {
  segment: ActiveSegment;
  onSegmentChange: (segment: ActiveSegment) => void;
}

export const SessionGroupsHeader = memo(function SessionGroupsHeader({
  segment,
  onSegmentChange,
}: SessionGroupsHeaderProps) {
  const theme = useTheme();
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
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: "100%" },
});
