import { Redirect, Stack } from "expo-router";

export default function DevLayout() {
  if (!__DEV__) return <Redirect href="/(authed)" />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="design-system" />
      <Stack.Screen name="sheet-preview" options={{ presentation: "formSheet" }} />
    </Stack>
  );
}
