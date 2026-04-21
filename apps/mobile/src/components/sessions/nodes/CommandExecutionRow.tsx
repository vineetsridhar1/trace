import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { Text } from "@/components/design-system";
import { alpha, useTheme } from "@/theme";
import { formatCommandLabel, getCommandPrefix, serializeUnknown } from "./utils";

interface CommandExecutionRowProps {
  command: string;
  output?: string | Record<string, unknown>;
  exitCode?: number;
}

const ACCORDION_DURATION = 220;
const ACCORDION_EASING = Easing.bezier(0.16, 1, 0.3, 1);

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
  const [bodyHeight, setBodyHeight] = useState(0);
  const progress = useSharedValue(0);
  const prefix = getCommandPrefix(command);
  const display = formatCommandLabel(command);
  const hasOutput =
    (typeof output === "string" && output.trim().length > 0) ||
    (output && typeof output === "object" && Object.keys(output).length > 0);
  const hasError = exitCode != null && exitCode !== 0;
  const hasBody = Boolean(hasOutput || hasError);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: ACCORDION_DURATION,
      easing: ACCORDION_EASING,
    });
  }, [open, progress]);

  const bodyStyle = useAnimatedStyle(() => ({
    height: progress.value * bodyHeight,
    opacity: progress.value,
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 90}deg` }],
  }));

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
        <Animated.View style={[styles.chevron, { opacity: hasBody ? 1 : 0 }, chevronStyle]}>
          <SymbolView
            name="chevron.right"
            size={10}
            tintColor={theme.colors.mutedForeground}
            resizeMode="scaleAspectFit"
            style={styles.chevron}
          />
        </Animated.View>
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
      {hasBody ? (
        <Animated.View style={[styles.bodyClip, bodyStyle]}>
          <View
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0 && h !== bodyHeight) setBodyHeight(h);
            }}
            style={[
              styles.body,
              styles.bodyMeasure,
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
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", paddingVertical: 2 },
  header: { flexDirection: "row", alignItems: "center" },
  chevron: { width: 10, height: 10 },
  command: { flex: 1 },
  bodyClip: { overflow: "hidden" },
  bodyMeasure: { position: "absolute", left: 0, right: 0, top: 0 },
  body: {
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  code: { fontFamily: "Menlo", fontSize: 12, lineHeight: 16 },
});
