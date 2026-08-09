import { useCallback } from "react";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";
import { Card, Text } from "@/components/design-system";
import { haptic } from "@/lib/haptics";
import { alpha, useTheme } from "@/theme";

interface VisualPlanArtifactCardProps {
  artifactId: string;
  filePath: string;
}

/** Inline entry point for a visual-plan artifact in the session stream. */
export function VisualPlanArtifactCard({ artifactId, filePath }: VisualPlanArtifactCardProps) {
  const theme = useTheme();
  const router = useRouter();

  const openPlan = useCallback(() => {
    void haptic.light();
    router.push(`/plans/${artifactId}?filePath=${encodeURIComponent(filePath)}`);
  }, [artifactId, filePath, router]);

  return (
    <Card
      padding="md"
      elevation="low"
      onPress={() => void openPlan()}
      accessibilityLabel="Open visual plan"
      style={{
        ...styles.card,
        backgroundColor: alpha(theme.colors.accent, 0.08),
        borderColor: alpha(theme.colors.accent, 0.3),
        borderWidth: StyleSheet.hairlineWidth,
      }}
    >
      <SymbolView
        name="doc.richtext"
        size={20}
        tintColor={theme.colors.accent}
        resizeMode="scaleAspectFit"
        style={styles.icon}
      />
      <Text variant="footnote" style={[styles.eyebrow, { color: theme.colors.accent }]}>
        PLAN
      </Text>
      <Text variant="subheadline" style={styles.title}>
        Implementation plan
      </Text>
      <SymbolView
        name="chevron.right"
        size={14}
        tintColor={theme.colors.accent}
        resizeMode="scaleAspectFit"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  icon: {
    height: 20,
    width: 20,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  title: {
    flex: 1,
    fontWeight: "600",
  },
});
