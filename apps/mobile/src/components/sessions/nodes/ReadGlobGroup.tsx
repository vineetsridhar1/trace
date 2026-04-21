import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import type { ReadGlobItem } from "@trace/client-core";
import { Text } from "@/components/design-system";
import { alpha, motion, useTheme } from "@/theme";

interface ReadGlobGroupProps {
  items: ReadGlobItem[];
}

const ACCORDION_DURATION = motion.durations.accordion;
const ACCORDION_EASING = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * Summary row for a run of consecutive Read / Glob / Grep tool calls. Taps
 * toggle an expanded list of the file paths scanned. No file-contents view
 * in V1 — the expand target is paths only.
 */
export function ReadGlobGroup({ items }: ReadGlobGroupProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [bodyMounted, setBodyMounted] = useState(false);
  const bodyHeight = useSharedValue(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: ACCORDION_DURATION,
      easing: ACCORDION_EASING,
    });
  }, [open, progress]);

  const bodyStyle = useAnimatedStyle(() => ({
    height: progress.value * bodyHeight.value,
    opacity: progress.value,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 90}deg` }],
  }));

  if (items.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${items.length} file scan${items.length === 1 ? "" : "s"}`}
        onPress={() => {
          setBodyMounted(true);
          setOpen((v) => !v);
        }}
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
        <Animated.View style={[styles.chevron, chevronStyle]}>
          <SymbolView
            name="chevron.right"
            size={10}
            tintColor={theme.colors.mutedForeground}
            resizeMode="scaleAspectFit"
          />
        </Animated.View>
        <Text variant="caption1" color="mutedForeground" style={{ fontFamily: "Menlo" }}>
          {items.length} file scan{items.length === 1 ? "" : "s"} (Read/Glob)
        </Text>
      </Pressable>
      {bodyMounted ? (
        <Animated.View style={[styles.bodyClip, bodyStyle]}>
          <View
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0 && Math.abs(h - bodyHeight.value) > 0.5) {
                bodyHeight.value = h;
              }
            }}
            style={[
              styles.body,
              styles.bodyMeasure,
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
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", paddingVertical: 2 },
  header: { flexDirection: "row", alignItems: "center" },
  chevron: { width: 10, height: 10 },
  bodyClip: { overflow: "hidden" },
  bodyMeasure: { position: "absolute", left: 0, right: 0, top: 0 },
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
