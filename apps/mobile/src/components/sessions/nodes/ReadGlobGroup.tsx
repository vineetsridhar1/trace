import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { ReadGlobItem } from "@trace/client-core";
import { Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";

interface ReadGlobGroupProps {
  items: ReadGlobItem[];
}

/**
 * Summary row for a run of consecutive Read / Glob / Grep tool calls. Taps
 * toggle an expanded list of the file paths scanned. No file-contents view
 * in V1 — the expand target is paths only.
 */
export function ReadGlobGroup({ items }: ReadGlobGroupProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${items.length} file scan${items.length === 1 ? "" : "s"}`}
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
          style={styles.chevron}
        />
        <Text variant="caption1" color="mutedForeground" style={{ fontFamily: "Menlo" }}>
          {items.length} file scan{items.length === 1 ? "" : "s"} (Read/Glob)
        </Text>
      </Pressable>
      {open ? (
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
          {items.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text
                variant="caption1"
                style={{ color: theme.colors.foreground, fontWeight: "600" }}
              >
                {item.toolName}
              </Text>
              <Text variant="caption1" color="dimForeground">
                ·
              </Text>
              <Text
                variant="caption1"
                color="mutedForeground"
                numberOfLines={1}
                style={[styles.path, { fontFamily: "Menlo" }]}
              >
                {item.filePath || "—"}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", paddingVertical: 2 },
  header: { flexDirection: "row", alignItems: "center" },
  chevron: { width: 10, height: 10 },
  body: {
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
    gap: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  path: { flex: 1 },
});
