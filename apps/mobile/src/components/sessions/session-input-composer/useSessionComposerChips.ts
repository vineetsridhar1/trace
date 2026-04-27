import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useComposerModePalette, MODE_CYCLE } from "@/hooks/useComposerModePalette";
import type { ComposerMode } from "@/hooks/useComposerSubmit";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";
import { CHIP_EXPAND_HOLD_MS, MODE_FALLBACK_WIDTH, MODEL_CHIP_SIZE } from "./constants";

interface UseSessionComposerChipsOptions {
  mode: ComposerMode;
  setMode: Dispatch<SetStateAction<ComposerMode>>;
}

export function useSessionComposerChips({ mode, setMode }: UseSessionComposerChipsOptions) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const [modeWidths, setModeWidths] = useState<Partial<Record<ComposerMode, number>>>({});
  const [modeLabelVisible, setModeLabelVisible] = useState(false);
  const modeCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { glassAnimatedProps, cardBorderAnimatedStyle, chipAnimatedStyle, chipTextAnimatedStyle } =
    useComposerModePalette(mode);

  const modeMeasuredWidth = modeWidths[mode] ?? MODE_FALLBACK_WIDTH;
  const modeTargetWidth = modeLabelVisible ? modeMeasuredWidth : MODEL_CHIP_SIZE;

  const modeWidth = useSharedValue(modeTargetWidth);

  useEffect(() => {
    modeWidth.value = reducedMotion
      ? modeTargetWidth
      : withTiming(modeTargetWidth, {
          duration: theme.motion.durations.base,
        });
  }, [modeTargetWidth, modeWidth, reducedMotion, theme.motion.durations.base]);
  const modeWidthAnimatedStyle = useAnimatedStyle(() => ({ width: modeWidth.value }));

  const clearModeCollapseTimer = useCallback(() => {
    if (modeCollapseTimer.current) {
      clearTimeout(modeCollapseTimer.current);
      modeCollapseTimer.current = null;
    }
  }, []);

  const scheduleModeCollapse = useCallback(() => {
    clearModeCollapseTimer();
    modeCollapseTimer.current = setTimeout(() => {
      setModeLabelVisible(false);
      modeCollapseTimer.current = null;
    }, CHIP_EXPAND_HOLD_MS);
  }, [clearModeCollapseTimer]);

  const resetChips = useCallback(() => {
    clearModeCollapseTimer();
    setModeLabelVisible(false);
  }, [clearModeCollapseTimer]);

  useEffect(() => clearModeCollapseTimer, [clearModeCollapseTimer]);

  const handleModePress = useCallback(() => {
    void haptic.selection();
    if (!modeLabelVisible) {
      setModeLabelVisible(true);
      scheduleModeCollapse();
      return;
    }
    setMode((current) => {
      const idx = MODE_CYCLE.indexOf(current);
      return MODE_CYCLE[(idx + 1) % MODE_CYCLE.length] ?? "code";
    });
    scheduleModeCollapse();
  }, [modeLabelVisible, scheduleModeCollapse, setMode]);

  const handleModeMeasure = useCallback((measuredMode: ComposerMode, width: number) => {
    const roundedWidth = Math.ceil(width);
    setModeWidths((current) => {
      if (current[measuredMode] === roundedWidth) return current;
      return { ...current, [measuredMode]: roundedWidth };
    });
  }, []);

  const modeIconTint =
    mode === "plan" ? "#8b5cf6" : mode === "ask" ? "#ea580c" : theme.colors.foreground;

  return {
    cardBorderAnimatedStyle,
    chipAnimatedStyle,
    chipTextAnimatedStyle,
    glassAnimatedProps,
    handleModeMeasure,
    handleModePress,
    modeIconTint,
    modeLabelVisible,
    modeWidthAnimatedStyle,
    resetChips,
  };
}
