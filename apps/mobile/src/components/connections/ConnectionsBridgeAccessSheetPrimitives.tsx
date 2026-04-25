import { Pressable, StyleSheet } from "react-native";
import { Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";

export function ConnectionsBridgeAccessSectionTitle({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text
      variant="caption1"
      style={{
        color: theme.colors.dimForeground,
        fontWeight: "600",
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {children}
    </Text>
  );
}

export function ConnectionsBridgeAccessOption({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.option,
        {
          borderColor: selected ? theme.colors.accent : theme.colors.border,
          backgroundColor: selected ? alpha(theme.colors.accent, 0.16) : theme.colors.surfaceDeep,
        },
      ]}
    >
      <Text variant="subheadline" color="foreground" style={styles.optionTitle}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="caption1" color="mutedForeground" style={styles.optionSubtitle}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 4,
  },
  optionTitle: {
    fontWeight: "600",
  },
  optionSubtitle: {
    marginTop: 2,
  },
});
