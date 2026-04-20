import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, Glass, Screen, Text } from "@/components/design-system";
import { useTheme, type GlassUseCase } from "@/theme";

const GLASS_PRESETS: GlassUseCase[] = [
  "tabBar",
  "navBar",
  "input",
  "pinnedBar",
  "card",
];

const BG_STRIPES = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#a855f7",
  "#ec4899",
];

export default function Ticket12Preview() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.xl,
        }}
      >
        <Text variant="title1">Ticket 12 preview</Text>

        {/* Cards — elevations */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="headline">Card elevations</Text>
          <Card elevation="low"><Text>elevation="low"</Text></Card>
          <Card elevation="medium"><Text>elevation="medium"</Text></Card>
          <Card elevation="high"><Text>elevation="high"</Text></Card>
        </View>

        {/* Cards — tappable + glass */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="headline">Card variants</Text>
          <Card
            onPress={() => {}}
            haptic="medium"
            accessibilityLabel="Tappable card"
          >
            <Text>onPress (scale + haptic on device)</Text>
          </Card>
          <Card glass>
            <Text>glass={"{true}"} — routes through Glass</Text>
          </Card>
        </View>

        {/* Glass — every preset over colorful stripes */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="headline">Glass presets</Text>
          <Text variant="caption1" color="mutedForeground">
            iOS 26+: real Liquid Glass. Simulator/iOS &lt;26: BlurView fallback.
          </Text>
          <View style={styles.glassStage}>
            <View style={StyleSheet.absoluteFill}>
              {BG_STRIPES.map((color) => (
                <View key={color} style={{ flex: 1, backgroundColor: color }} />
              ))}
            </View>
            <View style={{ gap: theme.spacing.sm, padding: theme.spacing.md }}>
              {GLASS_PRESETS.map((preset) => (
                <Glass
                  key={preset}
                  preset={preset}
                  style={{ padding: theme.spacing.md }}
                >
                  <Text>preset="{preset}"</Text>
                </Glass>
              ))}
            </View>
          </View>
        </View>

        {/* Sheet */}
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="headline">Sheet</Text>
          <Button
            title="Open sheet"
            onPress={() => router.push("/sheets/ticket-12-demo")}
          />
        </View>

        <View style={{ height: theme.spacing.xxl }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  glassStage: {
    height: 360,
    borderRadius: 14,
    overflow: "hidden",
  },
});
