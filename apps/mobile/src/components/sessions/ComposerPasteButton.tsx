import { Pressable, StyleSheet } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { SymbolView } from "expo-symbols";
import { Glass, Text } from "@/components/design-system";
import { useTheme } from "@/theme";

interface Props {
  visible: boolean;
  onPress: () => void;
}

/**
 * Liquid-glass "Paste image" pill that fades in above the composer when
 * there's an image on the clipboard and the input is focused. Matches the
 * visual language of `NewActivityPill`.
 */
export function ComposerPasteButton({ visible, onPress }: Props) {
  const theme = useTheme();
  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(140)}
      style={styles.row}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Paste image from clipboard"
        hitSlop={8}
        style={({ pressed }) => ({ opacity: pressed ? 0.78 : 1 })}
      >
        <Glass
          preset="input"
          glassStyleEffect="clear"
          style={[styles.pill, { paddingHorizontal: theme.spacing.md }]}
        >
          <SymbolView
            name="photo.on.rectangle"
            size={14}
            tintColor={theme.colors.foreground}
            resizeMode="scaleAspectFit"
            style={styles.icon}
          />
          <Text variant="footnote" color="foreground">
            Paste image
          </Text>
        </Glass>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", paddingBottom: 6 },
  pill: {
    height: 32,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  icon: { width: 14, height: 14 },
});
