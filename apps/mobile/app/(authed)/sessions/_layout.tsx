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
          title: "Session",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen
        name="[groupId]/preview"
        options={{
          title: "Preview",
          headerBackTitle: "Back",
        }}
      />
    </Stack>
  );
}
