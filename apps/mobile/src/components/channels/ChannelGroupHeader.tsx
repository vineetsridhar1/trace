import { memo } from "react";
import { StyleSheet, View } from "react-native";
import { useEntityField } from "@trace/client-core";
import { Text } from "@/components/design-system";
import { useTheme } from "@/theme";

export interface ChannelGroupHeaderProps {
  groupId: string;
}

export const ChannelGroupHeader = memo(function ChannelGroupHeader({
  groupId,
}: ChannelGroupHeaderProps) {
  const theme = useTheme();
  const name = useEntityField("channelGroups", groupId, "name");
  if (!name) return null;
  return (
    <View
      style={[
        styles.container,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.lg,
          paddingBottom: theme.spacing.xs,
          backgroundColor: theme.colors.background,
        },
      ]}
    >
      <Text variant="footnote" color="mutedForeground" style={styles.text}>
        {name.toUpperCase()}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { width: "100%" },
  text: { letterSpacing: 0.5 },
});
