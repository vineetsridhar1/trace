import { StyleSheet, View, type ViewStyle } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { alpha, useTheme } from "@/theme";
import { Text } from "./Text";
import { Button } from "./Button";

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
}

export interface EmptyStateProps {
  icon: SFSymbol;
  title: string;
  subtitle?: string;
  action?: EmptyStateAction;
  style?: ViewStyle;
}

export function EmptyState({ icon, title, subtitle, action, style }: EmptyStateProps) {
  const theme = useTheme();
  const isError = String(icon).includes("exclamationmark");
  const iconColor = isError ? theme.colors.warning : theme.colors.accent;
  const iconBackground = isError ? alpha(theme.colors.warning, 0.14) : theme.colors.accentMuted;

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.iconWell,
          {
            backgroundColor: iconBackground,
            borderColor: alpha(iconColor, 0.22),
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <SymbolView name={icon} size={30} tintColor={iconColor} />
      </View>
      <Text variant="headline" color="foreground" align="center" style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="footnote" color="mutedForeground" align="center" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
      {action ? (
        <View style={styles.action}>
          <Button title={action.label} onPress={action.onPress} variant="secondary" size="md" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
    paddingHorizontal: 28,
    paddingVertical: 44,
  },
  iconWell: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: {
    marginTop: 18,
  },
  subtitle: {
    marginTop: 8,
    maxWidth: 270,
  },
  action: {
    marginTop: 22,
  },
});
