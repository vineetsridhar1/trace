import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Text } from "@/components/design-system";
import { FloatingBackButton } from "@/components/navigation/FloatingBackButton";
import { ArtifactUploadedCard } from "@/components/sessions/nodes/ArtifactUploadedCard";
import { VisualPlanArtifactCard } from "@/components/sessions/nodes/VisualPlanArtifactCard";
import { useTheme } from "@/theme";

const SAMPLE_ARTIFACTS = [
  {
    artifactId: "sample-product-brief",
    file: { path: "product-brief.pdf", mediaType: "application/pdf", size: 482_000 },
  },
  {
    artifactId: "sample-dashboard-preview",
    file: { path: "dashboard-preview.png", mediaType: "image/png", size: 1_840_000 },
  },
  {
    artifactId: "sample-demo-recording",
    file: { path: "demo-recording.mp4", mediaType: "video/mp4", size: 14_200_000 },
  },
  {
    artifactId: "sample-export",
    file: { path: "customer-export.csv", mediaType: "text/csv", size: 28_400 },
  },
] as const;

/** Development-only chat stream for reviewing artifact-card treatments. */
export default function ArtifactCardsPreviewScreen() {
  const router = useRouter();
  const theme = useTheme();

  return (
    <Screen edges={["left", "right"]}>
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: theme.spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text variant="title2">Artifact cards</Text>
            <Text variant="footnote" color="mutedForeground">
              Developer preview · Session chat
            </Text>
          </View>
          <Text variant="body">I created the requested files and added them to this session.</Text>
          {SAMPLE_ARTIFACTS.map(({ artifactId, file }) => (
            <ArtifactUploadedCard key={artifactId} artifactId={artifactId} file={file} />
          ))}
          <VisualPlanArtifactCard artifactId="sample-plan" filePath="implementation-plan.html" />
        </ScrollView>
        <View style={[styles.backButton, { backgroundColor: theme.colors.surface }]}>
          <FloatingBackButton onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { gap: 12, paddingHorizontal: 16, paddingTop: 88 },
  header: { gap: 4, marginBottom: 8 },
  backButton: { borderRadius: 999, left: 16, position: "absolute", top: 16 },
});
