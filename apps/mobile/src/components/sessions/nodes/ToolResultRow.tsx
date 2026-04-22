import { memo, useCallback, useMemo, useState } from "react";
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
export const ToolResultRow = memo(function ToolResultRow({
  output,
  isError = false,
}: ToolResultRowProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const { full, preview, multiline } = useMemo(() => {
    const serialized = typeof output === "string" ? output : serializeUnknown(output);
    const newline = serialized.indexOf("\n");
    const firstLine = newline === -1 ? serialized : serialized.slice(0, newline);
    const short = truncate(firstLine, PREVIEW_LEN);
    return {
      full: serialized,
      preview: short,
      multiline: newline !== -1 || serialized.length > short.length,
    };
  }, [output]);
  const tint = isError ? theme.colors.destructive : theme.colors.success;
  const iconName = isError ? "xmark.circle.fill" : "checkmark.circle.fill";
  const toggleExpanded = useCallback(() => setExpanded((v) => !v), []);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={multiline ? toggleExpanded : undefined}
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
});

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
