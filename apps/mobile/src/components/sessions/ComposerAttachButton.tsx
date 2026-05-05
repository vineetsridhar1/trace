import { Pressable, StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";
import { Glass } from "@/components/design-system";
import { useTheme } from "@/theme";

interface Props {
  enabled: boolean;
  onPress: () => void;
}

const SIZE = 46;

export function ComposerAttachButton({ enabled, onPress }: Props) {
  const theme = useTheme();
  return (
    <Glass preset="input" interactive style={[styles.glass, { borderColor: theme.colors.border }]}>
      <Pressable
        onPress={onPress}
        disabled={!enabled}
        accessibilityRole="button"
        accessibilityLabel="Attach file or image"
        style={({ pressed }) => [
          styles.pressable,
          { opacity: enabled ? (pressed ? 0.78 : 1) : 0.45 },
        ]}
      >
        <SymbolView
          name="paperclip"
          size={18}
          tintColor={theme.colors.foreground}
          weight="medium"
          resizeMode="scaleAspectFit"
          style={styles.icon}
        />
      </Pressable>
    </Glass>
  );
}

const styles = StyleSheet.create({
  glass: {
    width: SIZE,
    height: SIZE,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    overflow: "hidden",
  },
  pressable: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { width: 18, height: 18 },
});
