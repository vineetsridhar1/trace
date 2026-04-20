import { Pressable, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Text } from "@/components/design-system/Text";
import { useTheme } from "@/theme";

export function FakeSessionAccessory() {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open session player"
      style={styles.row}
      onPress={() => {}}
    >
      <View style={[styles.symbolWrap, { backgroundColor: theme.colors.accentMuted }]}>
        <SymbolView
          name="bolt.horizontal.fill"
          size={16}
          tintColor={theme.colors.accent}
          weight="semibold"
        />
      </View>
      <View style={styles.text}>
        <Text variant="body" numberOfLines={1} style={{ fontWeight: "600" }}>
          Refactor auth middleware
        </Text>
        <Text
          variant="caption1"
          color="mutedForeground"
          numberOfLines={1}
        >
          Claude · 12 steps · running
        </Text>
      </View>
      <SymbolView
        name="chevron.up"
        size={14}
        tintColor={theme.colors.mutedForeground}
        weight="medium"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  symbolWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
  },
});
