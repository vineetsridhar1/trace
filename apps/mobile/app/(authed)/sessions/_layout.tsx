import { Stack } from "expo-router";
import { useNativeStackScreenOptions } from "@/theme/nativeNavigation";

export default function SessionsLayout() {
  const screenOptions = useNativeStackScreenOptions();

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen
        name="[groupId]"
        options={{
          title: "Session Group",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="[groupId]/[sessionId]"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
