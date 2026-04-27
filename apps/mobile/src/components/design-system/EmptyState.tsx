import { StyleSheet, View, type ViewStyle } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { useTheme } from "@/theme";
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

  return (
    <View style={[styles.container, style]}>
      <SymbolView
        name={icon}
        size={44}
        tintColor={theme.colors.dimForeground}
        style={styles.icon}
      />
      <Text variant="headline" color="foreground" align="center">
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
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  icon: {
    marginBottom: 16,
  },
  subtitle: {
    marginTop: 6,
    maxWidth: 260,
  },
  action: {
    marginTop: 20,
  },
});
