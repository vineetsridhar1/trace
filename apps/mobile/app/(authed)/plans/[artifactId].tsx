import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { getAuthHeaders } from "@trace/client-core";
import { Button, Screen, Text, TraceLoader } from "@/components/design-system";
import { VisualPlanViewer } from "@/components/sessions/VisualPlanViewer";
import { getActiveApiUrl } from "@/lib/connection-target";

export default function VisualPlanScreen() {
  const { artifactId, filePath } = useLocalSearchParams<{ artifactId: string; filePath: string }>();
  const router = useRouter();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artifactId || !filePath) {
      setError("This plan is unavailable.");
      return;
    }
    const controller = new AbortController();
    const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
    fetch(`${getActiveApiUrl()}/artifacts/${encodeURIComponent(artifactId)}/files/${encodedPath}`, {
      headers: getAuthHeaders(),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error())))
      .then(setHtml)
      .catch((caught: unknown) => {
        if (caught instanceof Error && caught.name === "AbortError") return;
        setError("Couldn't load this plan.");
      });
    return () => controller.abort();
  }, [artifactId, filePath]);

  if (html) return <VisualPlanViewer html={html} />;

  return (
    <Screen>
      <View
        style={{ alignItems: "center", flex: 1, gap: 12, justifyContent: "center", padding: 24 }}
      >
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
    </Screen>
  );
}
