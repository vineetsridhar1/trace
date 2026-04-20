import { StyleSheet, View, type ViewStyle } from "react-native";
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

const CONTROL_HEIGHT = 32;

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

  // iOS 26's native UISegmentedControl draws a capsule selection indicator
  // inside a less-rounded rectangular track, which reads as mismatched shapes.
  // Clip the whole control to a pill so the outer track matches the indicator.
  return (
    <View style={[styles.clip, style]}>
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
        style={styles.control}
        onChange={(e) => handleChange(e.nativeEvent.selectedSegmentIndex)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    borderRadius: CONTROL_HEIGHT / 2,
    overflow: "hidden",
  },
  control: {
    height: CONTROL_HEIGHT,
  },
});
