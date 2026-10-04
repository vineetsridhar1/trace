import { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { SymbolView, type SFSymbol } from "expo-symbols";
import { useRouter } from "expo-router";
import { useEntityStore } from "@trace/client-core";
import type { Artifact } from "@trace/gql";
import { EmptyState, ListRow, Text, TraceLoader } from "@/components/design-system";
import {
  artifactFileName,
  formatArtifactFileSize,
  isHtmlArtifactFile,
  shareArtifactFile,
  type MobileArtifactFile,
} from "@/lib/artifact-files";
import { useTheme } from "@/theme";

interface ArtifactsSheetContentProps {
  sessionId: string;
  onClose: () => void;
}

function iconForMediaType(mediaType: string): SFSymbol {
  if (mediaType === "application/pdf") return "doc.richtext";
  if (mediaType.startsWith("image/")) return "photo";
  if (mediaType === "text/html") return "safari";
  if (mediaType.startsWith("video/")) return "play.rectangle";
  return "doc";
}

export function ArtifactsSheetContent({ sessionId, onClose }: ArtifactsSheetContentProps) {
  const theme = useTheme();
  const router = useRouter();
  const artifactTable = useEntityStore((state) => state.artifacts);
  const artifacts = useMemo(
    () => Object.values(artifactTable).filter((artifact) => artifact.sessionId === sessionId),
    [artifactTable, sessionId],
  ) as Artifact[];
  const [opening, setOpening] = useState<string | null>(null);
  const files = useMemo(
    () =>
      artifacts.flatMap((artifact) =>
        artifact.manifest.files.map((file) => ({ artifactId: artifact.id, ...file })),
      ),
    [artifacts],
  );

  const openFile = useCallback(
    async ({ artifactId, ...file }: MobileArtifactFile & { artifactId: string }) => {
      if (isHtmlArtifactFile(file)) {
        onClose();
        router.push(`/plans/${artifactId}?filePath=${encodeURIComponent(file.path)}`);
        return;
      }
      const key = `${artifactId}:${file.path}`;
      setOpening(key);
      try {
        await shareArtifactFile(artifactId, file);
      } catch (error) {
        Alert.alert(
          "Couldn't open artifact",
          error instanceof Error ? error.message : "Try again in a moment.",
        );
      } finally {
        setOpening(null);
      }
    },
    [onClose, router],
  );

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.content, { paddingBottom: theme.spacing.xl }]}
    >
      <View style={styles.header}>
        <Text variant="headline">Artifacts</Text>
        <Text variant="footnote" color="mutedForeground">
          HTML opens in Trace. Other files open with an app on your device.
        </Text>
      </View>
      {files.length === 0 ? (
        <EmptyState
          icon="shippingbox"
          title="No artifacts yet"
          subtitle="Files created by the agent will appear here."
        />
      ) : (
        <View
          style={[
            styles.list,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.borderMuted,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          {files.map((file, index) => {
            const key = `${file.artifactId}:${file.path}`;
            const loading = opening === key;
            return (
              <ListRow
                key={key}
                title={artifactFileName(file.path)}
                subtitle={`${file.mediaType} · ${formatArtifactFileSize(file.size)}`}
                leading={
                  loading ? (
                    <TraceLoader size="small" color="mutedForeground" />
                  ) : (
                    <SymbolView
                      name={iconForMediaType(file.mediaType)}
                      size={18}
                      tintColor={theme.colors.foreground}
                    />
                  )
                }
                disclosureIndicator
                separator={index < files.length - 1}
                onPress={loading ? undefined : () => void openFile(file)}
              />
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  header: { gap: 4, paddingTop: 4 },
  list: { borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
});
