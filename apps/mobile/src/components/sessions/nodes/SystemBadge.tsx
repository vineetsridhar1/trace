import { StyleSheet, View } from "react-native";
import { Text } from "@/components/design-system";
import { useTheme } from "@/theme";

interface SystemBadgeProps {
  text: string;
}

/** Centered pill-shaped system status line — session started, terminated, etc. */
export function SystemBadge({ text }: SystemBadgeProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: theme.colors.surfaceDeep,
            borderRadius: theme.radius.full,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.xs,
          },
        ]}
      >
        <Text variant="caption1" color="mutedForeground">
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    paddingVertical: 6,
  },
  pill: { alignSelf: "center" },
});
