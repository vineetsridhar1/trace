import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image, StyleSheet, View } from "react-native";
import { Button, Screen, Text, TraceLoader } from "@/components/design-system";
import { FloatingBackButton } from "@/components/navigation/FloatingBackButton";
import { artifactFileName, downloadArtifactFile } from "@/lib/artifact-files";
import { useTheme } from "@/theme";

export default function ArtifactImageScreen() {
  const { artifactId, filePath } = useLocalSearchParams<{ artifactId: string; filePath: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artifactId || !filePath) {
      setError("This image is unavailable.");
      return;
    }
    let active = true;
    void downloadArtifactFile(artifactId, {
      path: filePath,
      mediaType: "image/*",
      size: 0,
    })
      .then((nextUri) => {
        if (active) setUri(nextUri);
      })
      .catch(() => {
        if (active) setError("Couldn't load this image.");
      });
    return () => {
      active = false;
    };
  }, [artifactId, filePath]);

  return (
    <Screen edges={["left", "right"]}>
      <View style={styles.root}>
        {uri ? (
          <Image source={{ uri }} resizeMode="contain" style={styles.image} />
        ) : (
          <View style={styles.status}>
            {error ? (
              <>
                <Text color="mutedForeground" align="center">
                  {error}
                </Text>
                <Button title="Go back" variant="secondary" onPress={() => router.back()} />
              </>
            ) : (
              <TraceLoader size="large" />
            )}
          </View>
        )}
        <View style={[styles.backButton, { backgroundColor: theme.colors.surface }]}>
          <FloatingBackButton onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  image: { flex: 1, width: "100%" },
  status: { alignItems: "center", flex: 1, gap: 12, justifyContent: "center", padding: 24 },
  backButton: { borderRadius: 999, left: 16, position: "absolute", top: 16 },
});
