import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Text } from "@/components/design-system";
import { useTheme } from "@/theme";
import { Markdown } from "./Markdown";

interface CompletionRowProps {
  result?: string;
  isUserStop?: boolean;
}

/** Session end marker — `result` vs `error` payloads on `session_output`. */
export function CompletionRow({ result, isUserStop }: CompletionRowProps) {
  const theme = useTheme();

  if (isUserStop) {
    return (
      <View style={[styles.row, { gap: 6, paddingVertical: 4 }]}>
        <SymbolView
          name="stop.fill"
          size={10}
          tintColor={theme.colors.destructive}
          resizeMode="scaleAspectFit"
          style={styles.icon10}
        />
        <Text variant="caption1" color="mutedForeground">
          Stopped by user
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { gap: theme.spacing.xs, paddingVertical: 4 }]}>
      <View style={[styles.row, { gap: 8 }]}>
        <SymbolView
          name="checkmark.circle"
          size={14}
          tintColor={theme.colors.mutedForeground}
          resizeMode="scaleAspectFit"
          style={styles.icon14}
        />
        <Text variant="footnote" style={{ color: theme.colors.foreground, fontWeight: "600" }}>
          Run ended
        </Text>
      </View>
      {result ? (
        <View style={styles.result}>
          <Markdown>{result}</Markdown>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%" },
  row: { flexDirection: "row", alignItems: "center" },
  icon10: { width: 10, height: 10 },
  icon14: { width: 14, height: 14 },
  result: { paddingLeft: 22 },
});
