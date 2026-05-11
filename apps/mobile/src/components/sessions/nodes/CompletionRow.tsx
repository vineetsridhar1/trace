import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Text } from "@/components/design-system";
import { useTheme } from "@/theme";
import { Markdown } from "./Markdown";

interface CompletionRowProps {
  result?: string;
  error?: string;
}

/** Session end marker — `result` vs `error` payloads on `session_output`. */
export function CompletionRow({ result, error }: CompletionRowProps) {
  const theme = useTheme();

  if (error !== undefined) {
    return (
      <View style={[styles.wrapper, { gap: theme.spacing.xs, paddingVertical: 4 }]}>
        <View style={[styles.row, { gap: 8 }]}>
          <SymbolView
            name="exclamationmark.circle"
            size={14}
            tintColor={theme.colors.destructive}
            resizeMode="scaleAspectFit"
            style={styles.icon14}
          />
          <Text variant="footnote" style={{ color: theme.colors.foreground, fontWeight: "600" }}>
            Session error
          </Text>
        </View>
        {error ? (
          <View style={styles.result}>
            <Text variant="footnote" color="mutedForeground">
              {error}
            </Text>
          </View>
        ) : null}
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
  icon14: { width: 14, height: 14 },
  result: { paddingLeft: 22 },
});
