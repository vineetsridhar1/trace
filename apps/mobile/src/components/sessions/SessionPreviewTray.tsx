import { memo, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { alpha, useTheme } from "@/theme";

interface SessionPreviewTrayProps {
  url: string;
  enabled?: boolean;
  onOpen: () => void;
}

function getPreviewLabel(url: string): string {
  if (!url) return "Open preview";
  try {
    const parsed = new URL(url);
    return parsed.host || parsed.pathname || "Open preview";
  } catch {
    return url;
  }
}

export const SessionPreviewTray = memo(function SessionPreviewTray({
  url,
  enabled = true,
  onOpen,
}: SessionPreviewTrayProps) {
  const theme = useTheme();
  const label = useMemo(() => getPreviewLabel(url), [url]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open preview"
      disabled={!enabled}
      onPress={() => {
        if (!enabled) return;
        void haptic.selection();
        onOpen();
      }}
      style={({ pressed }) => [
        styles.root,
        {
          backgroundColor: enabled
            ? pressed
              ? theme.colors.surface
              : alpha(theme.colors.surface, 0.96)
            : alpha(theme.colors.surface, 0.6),
          borderColor: alpha(theme.colors.borderMuted, enabled ? 0.9 : 0.5),
          opacity: enabled ? 1 : 0.7,
        },
      ]}
    >
      <View style={[styles.grabber, { backgroundColor: theme.colors.borderMuted }]} />
      <View style={styles.row}>
        <View style={styles.labelGroup}>
          <Text variant="caption1" color="dimForeground">
            Preview
          </Text>
          <Text variant="footnote" numberOfLines={1} color={enabled ? "foreground" : "mutedForeground"}>
            {label}
          </Text>
        </View>
        <SymbolView
          name="chevron.up"
          size={14}
          tintColor={enabled ? theme.colors.foreground : theme.colors.mutedForeground}
        />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
  },
  grabber: {
    alignSelf: "center",
    width: 32,
    height: 4,
    borderRadius: 999,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  labelGroup: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
