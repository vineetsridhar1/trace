import { Stack } from "expo-router";

export default function CreationsLayout() {
  return (
    <Stack
      screenOptions={{
        headerTintColor: "white",
        headerTitleStyle: { color: "white" },
        headerLargeTitleStyle: { color: "white" },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: "Creations",
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
        }}
      />
    </Stack>
  );
}
