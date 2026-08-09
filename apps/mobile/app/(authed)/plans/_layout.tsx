import { Stack } from "expo-router";

export default function PlansLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: true }}>
      <Stack.Screen name="[artifactId]" options={{ animation: "slide_from_right" }} />
    </Stack>
  );
}
