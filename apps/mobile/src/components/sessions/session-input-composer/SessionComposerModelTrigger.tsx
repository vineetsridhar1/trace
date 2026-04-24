import type { StyleProp, ViewStyle } from "react-native";
import type { CodingTool } from "@trace/gql";
import { SessionComposerSheetTrigger } from "./SessionComposerSheetTrigger";
import { SessionComposerToolLogo } from "./SessionComposerToolLogo";

interface SessionComposerModelTriggerProps {
  canInteract: boolean;
  currentTool: CodingTool;
  modelLabel: string;
  onOpenModelSheet: () => void;
  minWidth?: number;
  showLabel?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SessionComposerModelTrigger({
  canInteract,
  currentTool,
  modelLabel,
  onOpenModelSheet,
  minWidth,
  showLabel = true,
  style,
}: SessionComposerModelTriggerProps) {
  return (
    <SessionComposerSheetTrigger
      label={modelLabel}
      accessibilityLabel={`Model: ${modelLabel}`}
      leading={<SessionComposerToolLogo tool={currentTool} size={18} />}
      disabled={!canInteract}
      onPress={onOpenModelSheet}
      minWidth={minWidth}
      showLabel={showLabel}
      style={style}
    />
  );
}
