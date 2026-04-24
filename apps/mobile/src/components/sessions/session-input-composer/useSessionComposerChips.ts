import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { CodingTool } from "@trace/gql";
import { useComposerModePalette, MODE_CYCLE } from "@/hooks/useComposerModePalette";
import type { ComposerMode } from "@/hooks/useComposerSubmit";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme";
import {
  CHIP_EXPAND_HOLD_MS,
  INPUT_ACTION_GAP,
  MODE_FALLBACK_WIDTH,
  MODEL_CHIP_SIZE,
  MODEL_FALLBACK_WIDTH,
} from "./constants";

const CHIP_COLLAPSE_DURATION_MS = 90;

interface UseSessionComposerChipsOptions {
  currentTool: CodingTool;
  expanded: boolean;
  hasSendable: boolean;
  isActive: boolean;
  model: string | null | undefined;
  mode: ComposerMode;
  setMode: Dispatch<SetStateAction<ComposerMode>>;
}

export function useSessionComposerChips({
  currentTool,
  expanded,
  hasSendable,
  isActive,
  model,
  mode,
  setMode,
}: UseSessionComposerChipsOptions) {
  const theme = useTheme();
  const [modeWidths, setModeWidths] = useState<Partial<Record<ComposerMode, number>>>({});
  const [modeLabelVisible, setModeLabelVisible] = useState(false);
  const [modelLabelVisible, setModelLabelVisible] = useState(false);
  const [modelMeasuredWidth, setModelMeasuredWidth] = useState<number | null>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modeCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { glassAnimatedProps, cardBorderAnimatedStyle, chipAnimatedStyle, chipTextAnimatedStyle } =
    useComposerModePalette(mode);

  const modeMeasuredWidth = modeWidths[mode] ?? MODE_FALLBACK_WIDTH;
  const modeTargetWidth = modeLabelVisible ? modeMeasuredWidth : MODEL_CHIP_SIZE;
  const modelTargetWidth = modelLabelVisible
    ? (modelMeasuredWidth ?? MODEL_FALLBACK_WIDTH)
    : MODEL_CHIP_SIZE;

  const modeWidth = useSharedValue(modeTargetWidth);
  const modelWidth = useSharedValue(MODEL_CHIP_SIZE);
  const chipsSlotProgress = useSharedValue(0);

  useEffect(() => {
    modeWidth.value = withTiming(modeTargetWidth, {
      duration: theme.motion.durations.base,
    });
  }, [modeTargetWidth, modeWidth, theme.motion.durations.base]);

  useEffect(() => {
    modelWidth.value = withTiming(modelTargetWidth, {
      duration: theme.motion.durations.base,
    });
  }, [modelTargetWidth, modelWidth, theme.motion.durations.base]);

  const chipsVisible = (expanded && !hasSendable && !isActive) || modelMenuOpen;
  useEffect(() => {
    chipsSlotProgress.value = withTiming(chipsVisible ? 1 : 0, {
      duration: chipsVisible
        ? theme.motion.durations.base
        : Math.min(theme.motion.durations.fast, CHIP_COLLAPSE_DURATION_MS),
    });
  }, [chipsSlotProgress, chipsVisible, theme.motion.durations.base, theme.motion.durations.fast]);

  const leadingChipsAnimatedStyle = useAnimatedStyle(() => ({
    width:
      (modeWidth.value + modelWidth.value + INPUT_ACTION_GAP * 2) *
      chipsSlotProgress.value,
  }));
  const modeWidthAnimatedStyle = useAnimatedStyle(() => ({ width: modeWidth.value }));
  const modelWidthAnimatedStyle = useAnimatedStyle(() => ({ width: modelWidth.value }));

  const clearModeCollapseTimer = useCallback(() => {
    if (modeCollapseTimer.current) {
      clearTimeout(modeCollapseTimer.current);
      modeCollapseTimer.current = null;
    }
  }, []);

  const clearModelCollapseTimer = useCallback(() => {
    if (modelCollapseTimer.current) {
      clearTimeout(modelCollapseTimer.current);
      modelCollapseTimer.current = null;
    }
  }, []);

  const scheduleModeCollapse = useCallback(() => {
    clearModeCollapseTimer();
    modeCollapseTimer.current = setTimeout(() => {
      setModeLabelVisible(false);
      modeCollapseTimer.current = null;
    }, CHIP_EXPAND_HOLD_MS);
  }, [clearModeCollapseTimer]);

  const scheduleModelCollapse = useCallback(() => {
    clearModelCollapseTimer();
    if (modelMenuOpen) return;
    modelCollapseTimer.current = setTimeout(() => {
      setModelLabelVisible(false);
      modelCollapseTimer.current = null;
    }, CHIP_EXPAND_HOLD_MS);
  }, [clearModelCollapseTimer, modelMenuOpen]);

  useEffect(() => {
    if (modelMenuOpen) {
      clearModelCollapseTimer();
      return;
    }
    if (!modelLabelVisible) return;
    clearModelCollapseTimer();
    modelCollapseTimer.current = setTimeout(() => {
      setModelLabelVisible(false);
      modelCollapseTimer.current = null;
    }, CHIP_EXPAND_HOLD_MS);
  }, [clearModelCollapseTimer, modelLabelVisible, modelMenuOpen]);

  const resetChips = useCallback(() => {
    clearModeCollapseTimer();
    setModeLabelVisible(false);
    clearModelCollapseTimer();
    setModelLabelVisible(false);
  }, [clearModeCollapseTimer, clearModelCollapseTimer]);

  useEffect(() => clearModeCollapseTimer, [clearModeCollapseTimer]);
  useEffect(() => clearModelCollapseTimer, [clearModelCollapseTimer]);

  useEffect(() => {
    if (!hasSendable) return;
    clearModeCollapseTimer();
    setModeLabelVisible(false);
    if (modelMenuOpen) return;
    clearModelCollapseTimer();
    setModelLabelVisible(false);
  }, [clearModeCollapseTimer, clearModelCollapseTimer, hasSendable, modelMenuOpen]);

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

  const handleModelChipPress = useCallback(() => {
    void haptic.selection();
    if (!modelLabelVisible) {
      setModelLabelVisible(true);
      scheduleModelCollapse();
    }
  }, [modelLabelVisible, scheduleModelCollapse]);

  const handleModelMeasure = useCallback((width: number) => {
    const rounded = Math.ceil(width);
    setModelMeasuredWidth((current) => (current === rounded ? current : rounded));
  }, []);

  useEffect(() => {
    setModelMeasuredWidth(null);
  }, [currentTool, model]);

  const modeIconTint =
    mode === "plan" ? "#8b5cf6" : mode === "ask" ? "#ea580c" : theme.colors.foreground;

  return {
    cardBorderAnimatedStyle,
    chipAnimatedStyle,
    chipTextAnimatedStyle,
    chipsVisible,
    glassAnimatedProps,
    handleModeMeasure,
    handleModePress,
    handleModelChipPress,
    handleModelMeasure,
    leadingChipsAnimatedStyle,
    modeIconTint,
    modeLabelVisible,
    modeWidthAnimatedStyle,
    modelLabelVisible,
    modelWidthAnimatedStyle,
    resetChips,
    scheduleModelCollapse,
    setModelMenuOpen,
  };
}
