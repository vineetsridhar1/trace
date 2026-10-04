import { useCallback, useState } from "react";
import { Alert, StyleSheet } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { useRouter } from "expo-router";
import { Card, Text, TraceLoader } from "@/components/design-system";
import {
  artifactFileName,
  formatArtifactFileSize,
  isHtmlArtifactFile,
  shareArtifactFile,
  type MobileArtifactFile,
} from "@/lib/artifact-files";
import { haptic } from "@/lib/haptics";
import { alpha, useTheme } from "@/theme";

interface ArtifactUploadedCardProps {
  artifactId: string;
  file: MobileArtifactFile;
}

function iconForMediaType(mediaType: string): SFSymbol {
  if (mediaType === "application/pdf") return "doc.richtext";
  if (mediaType.startsWith("image/")) return "photo";
  if (mediaType.startsWith("video/")) return "play.rectangle";
  if (mediaType === "text/html") return "safari";
  return "doc";
}

/** Inline confirmation that an artifact was published in the session stream. */
export function ArtifactUploadedCard({ artifactId, file }: ArtifactUploadedCardProps) {
  const theme = useTheme();
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const displayName = artifactFileName(file.path);

  const openArtifact = useCallback(async () => {
    void haptic.light();
    if (isHtmlArtifactFile(file)) {
      router.push(`/plans/${artifactId}?filePath=${encodeURIComponent(file.path)}`);
      return;
    }
    setOpening(true);
    try {
      await shareArtifactFile(artifactId, file);
    } catch (error) {
      void haptic.error();
      Alert.alert(
        "Couldn't open artifact",
        error instanceof Error ? error.message : "Try again in a moment.",
      );
    } finally {
      setOpening(false);
    }
  }, [artifactId, file, router]);

  return (
    <Card
      padding="md"
      elevation="low"
      onPress={() => void openArtifact()}
      accessibilityLabel={`Open uploaded artifact ${displayName}`}
      style={{
        ...styles.card,
        backgroundColor: alpha(theme.colors.accent, 0.08),
        borderColor: alpha(theme.colors.accent, 0.3),
        borderWidth: StyleSheet.hairlineWidth,
      }}
    >
      <SymbolView
        name={iconForMediaType(file.mediaType)}
        size={20}
        tintColor={theme.colors.accent}
        resizeMode="scaleAspectFit"
      />
      <Text variant="footnote" style={[styles.eyebrow, { color: theme.colors.accent }]}>
        ARTIFACT UPLOADED
      </Text>
      <Text variant="subheadline" numberOfLines={1} style={styles.title}>
        {displayName}
      </Text>
      <Text variant="caption1" color="mutedForeground">
        {file.mediaType} · {formatArtifactFileSize(file.size)}
      </Text>
      {opening ? (
        <TraceLoader size="small" color="mutedForeground" />
      ) : (
        <SymbolView
          name="chevron.right"
          size={14}
          tintColor={theme.colors.accent}
          resizeMode="scaleAspectFit"
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  title: { flex: 1, fontWeight: "600", minWidth: "45%" },
});
