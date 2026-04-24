import { Text as NativeText, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { MODE_CYCLE } from "@/hooks/useComposerModePalette";
import type { ComposerMode } from "@/hooks/useComposerSubmit";
import { useTheme } from "@/theme";
import { MODE_ICON, MODE_LABEL } from "./constants";
import { styles } from "./styles";

interface SessionComposerMeasurementLayerProps {
  onModeMeasure: (mode: ComposerMode, width: number) => void;
}

export function SessionComposerMeasurementLayer({
  onModeMeasure,
}: SessionComposerMeasurementLayerProps) {
  const theme = useTheme();

  return (
    <View pointerEvents="none" style={styles.modeMeasureRoot}>
      {MODE_CYCLE.map((measuredMode) => (
        <View
          key={measuredMode}
          onLayout={(event) => onModeMeasure(measuredMode, event.nativeEvent.layout.width)}
          style={styles.modeMeasurePill}
        >
          <SymbolView
            name={MODE_ICON[measuredMode]}
            size={14}
            tintColor={theme.colors.foreground}
            weight="medium"
            resizeMode="scaleAspectFit"
            style={styles.modeIcon}
          />
          <NativeText style={styles.modeText}>{MODE_LABEL[measuredMode]}</NativeText>
        </View>
      ))}
    </View>
  );
}
