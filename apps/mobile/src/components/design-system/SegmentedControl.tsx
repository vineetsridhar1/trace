import { type ViewStyle } from "react-native";
import NativeSegmentedControl from "@react-native-segmented-control/segmented-control";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme";

export interface SegmentedControlProps {
  segments: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  enabled?: boolean;
  style?: ViewStyle;
}

export function SegmentedControl({
  segments,
  selectedIndex,
  onChange,
  enabled = true,
  style,
}: SegmentedControlProps) {
  const theme = useTheme();

  function handleChange(index: number) {
    if (index === selectedIndex) return;
    void Haptics.selectionAsync();
    onChange(index);
  }

  return (
    <NativeSegmentedControl
      values={segments}
      selectedIndex={selectedIndex}
      enabled={enabled}
      appearance={theme.scheme}
      backgroundColor={theme.colors.surfaceElevated}
      tintColor={theme.colors.surface}
      fontStyle={{ color: theme.colors.mutedForeground, fontSize: 13 }}
      activeFontStyle={{
        color: theme.colors.foreground,
        fontSize: 13,
        fontWeight: "600",
      }}
      style={style}
      onChange={(e) => handleChange(e.nativeEvent.selectedSegmentIndex)}
    />
  );
}
