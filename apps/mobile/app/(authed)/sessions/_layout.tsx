import { Stack } from "expo-router";

export default function SessionsLayout() {
  return (
    <Stack>
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
