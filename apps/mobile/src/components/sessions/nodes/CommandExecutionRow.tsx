import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import { formatCommandLabel, getCommandPrefix, serializeUnknown } from "./utils";

interface CommandExecutionRowProps {
  command: string;
  output?: string | Record<string, unknown>;
  exitCode?: number;
}

/**
 * Merged shell-command row — renders the command in monospace and expands
 * to show the full stdout/stderr payload.
 */
export function CommandExecutionRow({
  command,
  output,
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${prefix} ${display}`}
        disabled={!hasBody}
        onPress={() => setOpen((v) => !v)}
        style={[
          styles.header,
          {
            backgroundColor: "rgba(38,38,38,0.4)",
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
  body: {
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  code: { fontFamily: "Menlo", fontSize: 12, lineHeight: 16 },
});
