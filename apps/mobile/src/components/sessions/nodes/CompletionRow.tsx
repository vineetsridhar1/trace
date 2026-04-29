import { StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { SessionStatusRowTone } from "@trace/client-core";
import { Text } from "@/components/design-system";
import { useTheme } from "@/theme";
import { Markdown } from "./Markdown";

interface CompletionRowProps {
  result?: string;
  isUserStop?: boolean;
  title?: string;
  tone?: SessionStatusRowTone;
}

/** Session end marker — `result` vs `error` payloads on `session_output`. */
export function CompletionRow({ result, isUserStop, title, tone = "success" }: CompletionRowProps) {
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
          {title ?? "Stopped by user"}
        </Text>
      </View>
    );
  }

  const iconName =
    tone === "error"
      ? "exclamationmark.triangle"
      : tone === "info"
        ? "info.circle"
        : "checkmark.circle";
  const iconColor = tone === "error" ? theme.colors.destructive : theme.colors.mutedForeground;

  return (
    <View style={[styles.wrapper, { gap: theme.spacing.xs, paddingVertical: 4 }]}>
      <View style={[styles.row, { gap: 8 }]}>
        <SymbolView
          name={iconName}
          size={14}
          tintColor={iconColor}
          resizeMode="scaleAspectFit"
          style={styles.icon14}
        />
        <Text variant="footnote" style={{ color: theme.colors.foreground, fontWeight: "600" }}>
          {title ?? "Run ended"}
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
