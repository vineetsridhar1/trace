import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import { serializeUnknown, truncate } from "./utils";

interface ToolResultRowProps {
  output: string | Record<string, unknown>;
  isError?: boolean;
}

const PREVIEW_LEN = 80;

/**
 * Compact tool-result display. Shows a success/error icon plus a one-line
 * preview; tapping expands the full serialized output inline. Used inside
 * `ToolCallRow` (where each tool_use's matching tool_result is rendered) and
 * as a standalone fallback when a tool_result has no matching tool_use.
 */
export function ToolResultRow({ output, isError = false }: ToolResultRowProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const full = serializeUnknown(output);
  const firstLine = full.split("\n")[0] ?? "";
  const preview = truncate(firstLine, PREVIEW_LEN);
  const multiline = full.length > preview.length || full.includes("\n");
  const tint = isError ? theme.colors.destructive : theme.colors.success;
  const iconName = isError ? "xmark.circle.fill" : "checkmark.circle.fill";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={multiline ? () => setExpanded((v) => !v) : undefined}
      style={[
        styles.row,
        {
          backgroundColor: alpha(tint, 0.08),
          borderColor: alpha(tint, 0.24),
          borderRadius: theme.radius.md,
          padding: theme.spacing.sm,
          gap: theme.spacing.xs,
        },
      ]}
    >
      <View style={styles.header}>
        <SymbolView
          name={iconName}
          size={14}
          tintColor={tint}
          resizeMode="scaleAspectFit"
          style={styles.icon}
        />
        <Text
          variant="caption1"
          color="mutedForeground"
          numberOfLines={expanded ? undefined : 1}
          style={styles.preview}
        >
          {expanded ? full : preview}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  icon: { width: 14, height: 14, marginTop: 1 },
  preview: { flex: 1, fontFamily: "Menlo", fontSize: 12, lineHeight: 16 },
});
