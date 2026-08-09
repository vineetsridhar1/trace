import { useCallback, useState } from "react";
import { StyleSheet } from "react-native";
import { SymbolView } from "expo-symbols";
import { getAuthHeaders } from "@trace/client-core";
import { Card, Text } from "@/components/design-system";
import { VisualPlanViewer } from "@/components/sessions/VisualPlanViewer";
import { getActiveApiUrl } from "@/lib/connection-target";
import { haptic } from "@/lib/haptics";
import { alpha, useTheme } from "@/theme";

interface VisualPlanArtifactCardProps {
  artifactId: string;
  filePath: string;
}

/** Inline entry point for a visual-plan artifact in the session stream. */
export function VisualPlanArtifactCard({ artifactId, filePath }: VisualPlanArtifactCardProps) {
  const theme = useTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPlan = useCallback(async () => {
    if (loading) return;
    if (html) return;

    setLoading(true);
    setError(null);
    void haptic.light();
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    try {
      const response = await fetch(
        `${getActiveApiUrl()}/artifacts/${encodeURIComponent(artifactId)}/files/${encodedPath}`,
        { headers: getAuthHeaders() },
      );
      if (!response.ok) throw new Error("Couldn't load this plan.");
      setHtml(await response.text());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't load this plan.");
      void haptic.error();
    } finally {
      setLoading(false);
    }
  }, [artifactId, filePath, html, loading]);

  return (
    <>
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
          {loading ? "Opening plan…" : "Implementation plan"}
        </Text>
        <SymbolView
          name="chevron.right"
          size={14}
          tintColor={theme.colors.accent}
          resizeMode="scaleAspectFit"
        />
        {error ? (
          <Text variant="caption1" color="destructive" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </Card>
      {html ? <VisualPlanViewer html={html} visible onClose={() => setHtml(null)} /> : null}
    </>
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
  error: {
    marginLeft: 28,
    width: "100%",
  },
});
