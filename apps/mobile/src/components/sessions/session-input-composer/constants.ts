import type { SFSymbol } from "expo-symbols";
import type { ComposerMode } from "@/hooks/useComposerSubmit";

export const CLOUD_RUNTIME_ID = "__cloud__";

export const MODE_LABEL: Record<ComposerMode, string> = {
  code: "Code",
  plan: "Plan",
  ask: "Ask",
};

export const MODE_ICON: Record<ComposerMode, SFSymbol> = {
  code: "pencil",
  plan: "map",
  ask: "questionmark.circle",
};

export const MODE_PILL_HEIGHT = 38;
export const MODE_PILL_HORIZONTAL_PADDING = 10;
export const MODE_CONTENT_GAP = 5;
export const MODE_FALLBACK_WIDTH = 70;
export const MODEL_FALLBACK_WIDTH = 160;
export const CHIP_EXPAND_HOLD_MS = 1800;
export const MIN_INPUT_HEIGHT = 28;
export const MAX_INPUT_HEIGHT = 500;
export const ACTION_SIZE = 46;
export const INPUT_ACTION_GAP = 8;
export const MAX_IMAGES = 5;
export const MODEL_CHIP_SIZE = ACTION_SIZE;
