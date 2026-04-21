import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Spinner, Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import { serializeUnknown, truncate } from "./utils";

interface SubagentRowProps {
  description: string;
  subagentType: string;
  isLoading: boolean;
  result?: string;
}

const PREVIEW_LEN = 80;

/**
 * Row for `agent` / `task` tool calls. Mirrors web's SubagentRow but without
 * nested-event expansion (children render nothing on mobile in V1 — the node
 * builder already hides `parentId`-carrying events).
 */
export function SubagentRow({
  description,
  subagentType,
  isLoading,
  result,
}: SubagentRowProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const tint = colorForType(theme, subagentType);
  const preview = result ? truncate(result.split("\n")[0] ?? "", PREVIEW_LEN) : null;

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Subagent: ${description}`}
        disabled={!result}
        onPress={() => setOpen((v) => !v)}
        style={[
          styles.header,
          {
            backgroundColor: alpha(tint, 0.1),
            borderColor: alpha(tint, 0.3),
            borderRadius: theme.radius.sm,
            paddingVertical: theme.spacing.xs,
            paddingHorizontal: theme.spacing.sm,
            gap: theme.spacing.xs,
          },
        ]}
      >
        {isLoading ? (
          <Spinner size="small" color="mutedForeground" />
        ) : (
          <SymbolView
            name="checkmark.circle.fill"
            size={12}
            tintColor={tint}
            resizeMode="scaleAspectFit"
            style={styles.icon}
          />
        )}
        <Text variant="caption1" style={{ color: tint, fontWeight: "600" }}>
          {subagentType}
        </Text>
        <Text
          variant="caption1"
          color="foreground"
          numberOfLines={1}
          style={styles.description}
        >
          {description}
        </Text>
      </Pressable>
      {open && result ? (
        <View
          style={[
            styles.body,
            {
              backgroundColor: alpha(theme.colors.surfaceElevated, 0.4),
              borderColor: theme.colors.borderMuted,
              borderRadius: theme.radius.md,
              padding: theme.spacing.sm,
            },
          ]}
        >
          <Text style={[styles.code, { color: theme.colors.mutedForeground }]} selectable>
            {serializeUnknown(result)}
          </Text>
        </View>
      ) : !open && preview ? (
        <Text
          variant="caption2"
          color="dimForeground"
          numberOfLines={1}
          style={styles.resultPreview}
        >
          {preview}
        </Text>
      ) : null}
    </View>
  );
}

function colorForType(theme: { colors: { accent: string; statusInReview: string; statusMerged: string; mutedForeground: string } }, type: string): string {
  const lowered = type.toLowerCase();
  if (lowered.startsWith("explore")) return theme.colors.statusInReview;
  if (lowered.startsWith("plan")) return theme.colors.statusMerged;
  if (lowered.startsWith("general")) return theme.colors.accent;
  return theme.colors.mutedForeground;
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", paddingVertical: 2 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 12, height: 12 },
  description: { flex: 1 },
  body: {
    marginTop: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  code: { fontFamily: "Menlo", fontSize: 12, lineHeight: 16 },
  resultPreview: { marginTop: 2, marginLeft: 18 },
});
