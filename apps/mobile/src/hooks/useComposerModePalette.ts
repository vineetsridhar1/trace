import { useEffect, useMemo } from "react";
import {
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { InteractionMode } from "@trace/client-core";
import { alpha, useTheme } from "@/theme";

export const MODE_CYCLE: InteractionMode[] = ["code", "plan", "ask"];
const MODE_PROGRESS_INPUT = [0, 1, 2];
const UNTINTED_GLASS = "rgba(255,255,255,0)";

/**
 * Per-mode tint/border/text interpolation for the composer card. A single
 * shared value drives five animated styles so the glass, card border, chip,
 * chip text, and send button all morph in lockstep as the user cycles modes.
 */
export function useComposerModePalette(mode: InteractionMode) {
  const theme = useTheme();
  const modeIndex = MODE_CYCLE.indexOf(mode);
  const modeProgress = useSharedValue(modeIndex);
  useEffect(() => {
    modeProgress.value = withTiming(modeIndex, { duration: theme.motion.durations.base });
  }, [modeIndex, modeProgress, theme.motion.durations.base]);

  const palette = useMemo(() => {
    const fg = theme.colors.foreground;
    const accent = theme.colors.accent;
    const plan = "#8b5cf6";
    const ask = "#ea580c";
    const baseGlassTint = theme.glass.input.tint ?? UNTINTED_GLASS;
    return {
      glassTint: [baseGlassTint, "rgba(50,39,74,0.66)", "rgba(70,42,27,0.66)"],
      cardBorder: [alpha(fg, 0.08), alpha(plan, 0.25), alpha(ask, 0.25)],
      chipBorder: [alpha(fg, 0.12), alpha(plan, 0.5), alpha(ask, 0.5)],
      chipBg: [alpha(fg, 0.05), alpha(plan, 0.16), alpha(ask, 0.16)],
      chipText: [fg, plan, ask],
      sendBg: [accent, plan, ask],
    };
  }, [
    theme.colors.accent,
    theme.colors.foreground,
    theme.glass.input.tint,
  ]);

  const glassAnimatedProps = useAnimatedProps(() => ({
    tintColor: interpolateColor(modeProgress.value, MODE_PROGRESS_INPUT, palette.glassTint),
  }));
  const cardBorderAnimatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(modeProgress.value, MODE_PROGRESS_INPUT, palette.cardBorder),
  }));
  const chipAnimatedStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(modeProgress.value, MODE_PROGRESS_INPUT, palette.chipBorder),
    backgroundColor: interpolateColor(modeProgress.value, MODE_PROGRESS_INPUT, palette.chipBg),
  }));
  const chipTextAnimatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(modeProgress.value, MODE_PROGRESS_INPUT, palette.chipText),
  }));
  const sendButtonAnimatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(modeProgress.value, MODE_PROGRESS_INPUT, palette.sendBg),
  }));

  return {
    glassAnimatedProps,
    cardBorderAnimatedStyle,
    chipAnimatedStyle,
    chipTextAnimatedStyle,
    sendButtonAnimatedStyle,
  };
}
