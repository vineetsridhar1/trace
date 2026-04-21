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
 * Merged shell-command row — renders the command in monospace with a success/
 * failure exit-code badge (green 0, red non-zero). Tap expands the full
 * stdout/stderr payload.
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
  const badgeColor = hasError
    ? theme.colors.destructive
    : exitCode === 0
      ? theme.colors.success
      : theme.colors.mutedForeground;

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${prefix} ${display}`}
        disabled={!hasBody}
        onPress={() => setOpen((v) => !v)}
        style={[
          styles.header,
          {
            backgroundColor: "rgba(255,255,255,0.1)",
            paddingVertical: theme.spacing.xs,
            paddingHorizontal: theme.spacing.sm,
            gap: theme.spacing.xs,
            borderRadius: theme.radius.sm,
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
        {exitCode != null ? (
          <View
            style={[
              styles.exit,
              {
                backgroundColor: alpha(badgeColor, 0.18),
                borderRadius: theme.radius.sm,
                paddingHorizontal: 6,
              },
            ]}
          >
            <Text variant="caption2" style={{ color: badgeColor, fontFamily: "Menlo" }}>
              {exitCode}
            </Text>
          </View>
        ) : null}
        <Text variant="caption2" color="dimForeground" style={styles.time}>
          {formatTime(timestamp)}
        </Text>
      </Pressable>
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
  header: { flexDirection: "row", alignItems: "center" },
  chevron: { width: 10, height: 10 },
  command: { flex: 1 },
  exit: { paddingVertical: 1 },
  time: { marginLeft: "auto" },
  body: {
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  code: { fontFamily: "Menlo", fontSize: 12, lineHeight: 16 },
});
