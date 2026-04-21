import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import { formatCommandLabel, formatTime, getCommandPrefix, serializeUnknown } from "./utils";

interface CommandExecutionRowProps {
  command: string;
  output?: string | Record<string, unknown>;
  timestamp: string;
  exitCode?: number;
}

/**
 * Merged shell-command row — renders the command in monospace and expands
 * to show the full stdout/stderr payload.
 */
export function CommandExecutionRow({
  command,
  output,
  timestamp,
  exitCode,
}: CommandExecutionRowProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const prefix = getCommandPrefix(command);
  const display = formatCommandLabel(command);
  const hasOutput =
    (typeof output === "string" && output.trim().length > 0) ||
    (output && typeof output === "object" && Object.keys(output).length > 0);
  const hasError = exitCode != null && exitCode !== 0;
  const hasBody = hasOutput || hasError;

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.card,
          {
            borderRadius: theme.radius.sm,
          },
        ]}
      >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${prefix} ${display}`}
        disabled={!hasBody}
        onPress={() => setOpen((v) => !v)}
        style={[
          styles.header,
          {
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            gap: theme.spacing.xs,
          },
        ]}
      >
        <SymbolView
          name={open ? "chevron.down" : "chevron.right"}
          size={10}
          tintColor={theme.colors.mutedForeground}
          resizeMode="scaleAspectFit"
          style={[styles.chevron, { opacity: hasBody ? 1 : 0 }]}
        />
        <Text variant="caption1" color="mutedForeground">
          {prefix}
        </Text>
        <Text
          variant="caption1"
          style={[styles.command, { color: theme.colors.foreground, fontFamily: "Menlo" }]}
          numberOfLines={1}
        >
          {display}
        </Text>
        <Text variant="caption2" color="dimForeground" style={styles.time}>
          {formatTime(timestamp)}
        </Text>
      </Pressable>
      </View>
      {open && hasBody ? (
        <View
          style={[
            styles.body,
            {
              backgroundColor: alpha(theme.colors.surfaceElevated, 0.4),
              borderColor: theme.colors.borderMuted,
              borderRadius: theme.radius.md,
              padding: theme.spacing.sm,
              gap: theme.spacing.xs,
            },
          ]}
        >
          <Text variant="caption2" color="dimForeground">
            Output
          </Text>
          <Text
            style={[styles.code, { color: theme.colors.mutedForeground }]}
            selectable
          >
            {hasOutput
              ? serializeUnknown(output)
              : `Command exited with code ${exitCode}.`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", paddingVertical: 2 },
  card: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  header: { flexDirection: "row", alignItems: "center" },
  chevron: { width: 10, height: 10 },
  command: { flex: 1 },
  time: { marginLeft: "auto" },
  body: {
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  code: { fontFamily: "Menlo", fontSize: 12, lineHeight: 16 },
});
