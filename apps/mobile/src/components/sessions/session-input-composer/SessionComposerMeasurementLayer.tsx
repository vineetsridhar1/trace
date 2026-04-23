import { Text as NativeText, View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { CodingTool } from "@trace/gql";
import { MODE_CYCLE } from "@/hooks/useComposerModePalette";
import type { ComposerMode } from "@/hooks/useComposerSubmit";
import { useTheme } from "@/theme";
import { MODE_ICON, MODE_LABEL } from "./constants";
import { SessionComposerToolLogo } from "./SessionComposerToolLogo";
import { styles } from "./styles";

interface SessionComposerMeasurementLayerProps {
  currentTool: CodingTool;
  modelLabel: string;
  onModeMeasure: (mode: ComposerMode, width: number) => void;
  onModelMeasure: (width: number) => void;
}

export function SessionComposerMeasurementLayer({
  currentTool,
  modelLabel,
  onModeMeasure,
  onModelMeasure,
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
      <View
        key={`model-measure:${currentTool}:${modelLabel}`}
        onLayout={(event) => onModelMeasure(event.nativeEvent.layout.width)}
        style={styles.modelMeasurePill}
      >
        <SessionComposerToolLogo tool={currentTool} size={13} />
        <NativeText style={styles.modelMeasureText}>{modelLabel}</NativeText>
      </View>
    </View>
  );
}
