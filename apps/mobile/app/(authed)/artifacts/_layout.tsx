import { Stack } from "expo-router";

export default function ArtifactsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: true }}>
      <Stack.Screen name="[artifactId]" options={{ animation: "fade" }} />
    </Stack>
  );
}
